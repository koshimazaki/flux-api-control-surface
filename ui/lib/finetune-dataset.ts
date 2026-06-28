import type { TrainingCollection } from "./types";
import { downloadZip, type ZipEntry } from "./zip-archive";

// FLUX.2 [klein] LoRA dataset export.
//
// Target format (AI-Toolkit / Diffusers convention): a flat folder of high-res
// (>=1024px recommended) images, each paired with a same-basename `.txt` caption
// sidecar. The trigger word must appear in every caption. We additionally emit an
// AI-Toolkit `config.yaml` and a `README.md` with exact run commands.
//
// buildKleinLoraDataset() is pure (no DOM / no fs) so it is unit-testable in the
// node test environment. The browser zip + download wrapper lives at the bottom.

// Resolvable Hugging Face repo id so the generated AI-Toolkit config.yaml works
// as-is and matches the README's Diffusers snippet. Override via options.baseModel
// (e.g. a local path) when training offline.
export const KLEIN_LORA_BASE_MODEL = "black-forest-labs/FLUX.2-klein-9B";
export const DEFAULT_TRIGGER_TOKEN = "bfl_cyberflower";

// Guardrails: the dataset route accepts arbitrary collection payloads from MCP /
// local callers, so cap item count and per-image size and only accept real images.
export const MAX_DATASET_ITEMS = 200;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

export type KleinLoraConfigOptions = {
  triggerToken?: string;
  /** Resolvable base model repo id or local path for the trainer. */
  baseModel?: string;
  /** Name used for the AI-Toolkit job + output safetensors basename. */
  name?: string;
  /** Training resolution (square). Klein LoRA recommends >= 1024. */
  resolution?: number;
  /** LoRA rank (network linear dim). */
  rank?: number;
  /** LoRA alpha. Defaults to rank. */
  alpha?: number;
  /** Total training steps. */
  steps?: number;
  /** Learning rate (rendered verbatim into YAML, e.g. "1e-4"). */
  learningRate?: string;
  /** Train batch size. */
  batchSize?: number;
  /** Save a checkpoint every N steps. */
  saveEvery?: number;
  /** Caption dropout rate (0..1). */
  captionDropoutRate?: number;
  /** Folder (relative to config.yaml) holding the image+caption sidecars. */
  datasetDir?: string;
  /** Output folder for trained safetensors + samples. */
  outputDir?: string;
};

export type ResolvedKleinLoraConfig = Required<Omit<KleinLoraConfigOptions, "alpha">> & {
  alpha: number;
  baseModel: string;
};

export type KleinLoraDatasetFile = {
  /** Path relative to the dataset root, e.g. "dataset/01_subject.png". */
  name: string;
  /** Text content for captions/config/readme; raw bytes for images. */
  content: string | Uint8Array;
};

export type KleinLoraDataset = {
  triggerToken: string;
  imageCount: number;
  datasetDir: string;
  configFileName: string;
  readmeFileName: string;
  config: ResolvedKleinLoraConfig;
  files: KleinLoraDatasetFile[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(base64, "base64"));
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type DecodedImage = { bytes: Uint8Array; ext: "png" | "jpg" | "webp" };

// Sniff the real format from magic bytes so a mislabeled data URL (an image/*
// MIME wrapping non-image bytes) is rejected and the on-disk extension matches
// the actual content.
function detectImageExt(bytes: Uint8Array): DecodedImage["ext"] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

// Strictly decode a base64 data:image URL: reject non-image / non-base64 input,
// cap the decoded size, and verify the bytes really are a PNG/JPEG/WebP so the
// dataset route can't be made to persist arbitrary bytes into a training folder.
function decodeImageDataUrl(dataUrl: string | undefined, label: string): DecodedImage {
  const match = (dataUrl || "").match(IMAGE_DATA_URL);
  if (!match) {
    throw new Error(`${label}: expected a base64 data:image/(png|jpeg|webp) URL.`);
  }
  const bytes = base64ToBytes(match[2].replace(/\s+/g, ""));
  if (bytes.length === 0) throw new Error(`${label}: decoded image is empty.`);
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`${label}: image exceeds ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`);
  }
  const ext = detectImageExt(bytes);
  if (!ext) throw new Error(`${label}: data is not a valid PNG, JPEG, or WebP image.`);
  return { bytes, ext };
}

// Guarantee the trigger word is present in every caption. Existing collection
// captions usually already start with the trigger; this is the safety net the
// klein/AI-Toolkit format requires.
export function ensureCaptionTrigger(caption: string | undefined, triggerToken: string): string {
  const trimmed = (caption || "").trim();
  const token = triggerToken.trim();
  if (!trimmed) return `${token}, `;
  if (trimmed.toLowerCase().includes(token.toLowerCase())) return trimmed;
  return `${token}, ${trimmed}`;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, numeric));
}

// Only accept a numeric-ish learning rate; anything else falls back to the
// default so it cannot inject arbitrary text into the YAML scalar.
function safeLearningRate(value: string | undefined): string {
  const trimmed = (value || "").trim();
  return /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(trimmed) ? trimmed : "1e-4";
}

export function resolveKleinLoraConfig(
  collection: Pick<TrainingCollection, "name" | "triggerToken">,
  options: KleinLoraConfigOptions = {}
): ResolvedKleinLoraConfig {
  // Strip control chars (incl. newlines) so the trigger can't break comment lines;
  // quote-escaping for scalar positions is handled by yamlString().
  const triggerToken =
    (options.triggerToken || collection.triggerToken || DEFAULT_TRIGGER_TOKEN).replace(/[\u0000-\u001f]+/g, " ").trim() ||
    DEFAULT_TRIGGER_TOKEN;
  const rank = clampInt(options.rank, 16, 1, 256);
  return {
    triggerToken,
    name: slugify(options.name || collection.name || "klein_lora") || "klein_lora",
    resolution: clampInt(options.resolution, 1024, 256, 2048),
    rank,
    alpha: clampInt(options.alpha, rank, 1, 512),
    steps: clampInt(options.steps, 2000, 1, 100_000),
    learningRate: safeLearningRate(options.learningRate),
    batchSize: clampInt(options.batchSize, 1, 1, 64),
    saveEvery: clampInt(options.saveEvery, 250, 1, 100_000),
    captionDropoutRate: clampNumber(options.captionDropoutRate, 0.05, 0, 1),
    datasetDir: (options.datasetDir || "dataset").replace(/^\.?\/+/, "").replace(/\.{2,}/g, ".").replace(/\/+$/, "") || "dataset",
    outputDir: (options.outputDir || "output").replace(/^\.?\/+/, "").replace(/\.{2,}/g, ".").replace(/\/+$/, "") || "output",
    baseModel: (options.baseModel || KLEIN_LORA_BASE_MODEL).replace(/[\u0000-\u001f]+/g, " ").trim() || KLEIN_LORA_BASE_MODEL
  };
}

// Escape an arbitrary string as a YAML double-quoted scalar so trigger words,
// names, and paths can't break out of the generated config.
function yamlString(value: string): string {
  const escaped = String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");
  return `"${escaped}"`;
}

// Hand-rendered AI-Toolkit (ostris/ai-toolkit) job config. Every interpolated
// string scalar is emitted through yamlString() so untrusted collection values
// stay quoted; numeric fields are clamped in resolveKleinLoraConfig().
export function buildKleinLoraConfigYaml(config: ResolvedKleinLoraConfig): string {
  const samplePrompt = `${config.triggerToken}, studio product shot on a neutral background`;
  return `---
# AI-Toolkit (https://github.com/ostris/ai-toolkit) LoRA training config
# Base model: FLUX.2 [klein] 9B (${config.baseModel})
# Trigger word: ${config.triggerToken}
job: extension
config:
  name: ${yamlString(config.name)}
  process:
    - type: "sd_trainer"
      training_folder: ${yamlString(config.outputDir)}
      device: "cuda:0"
      trigger_word: ${yamlString(config.triggerToken)}
      network:
        type: "lora"
        linear: ${config.rank}
        linear_alpha: ${config.alpha}
      save:
        dtype: "float16"
        save_every: ${config.saveEvery}
        max_step_saves_to_keep: 4
      datasets:
        - folder_path: ${yamlString(config.datasetDir)}
          caption_ext: "txt"
          caption_dropout_rate: ${config.captionDropoutRate}
          shuffle_tokens: false
          cache_latents_to_disk: true
          resolution: [${config.resolution}]
      train:
        batch_size: ${config.batchSize}
        steps: ${config.steps}
        gradient_accumulation_steps: 1
        train_unet: true
        train_text_encoder: false
        gradient_checkpointing: true
        noise_scheduler: "flowmatch"
        optimizer: "adamw8bit"
        lr: ${config.learningRate}
      model:
        name_or_path: ${yamlString(config.baseModel)}
        is_flux: true
        quantize: true
      sample:
        sampler: "flowmatch"
        sample_every: ${config.saveEvery}
        width: ${config.resolution}
        height: ${config.resolution}
        prompts:
          - ${yamlString(samplePrompt)}
        neg: ""
        seed: 42
        guidance_scale: 4
        sample_steps: 28
meta:
  name: ${yamlString(config.name)}
  version: "1.0"
`;
}

export function buildKleinLoraReadme(config: ResolvedKleinLoraConfig): string {
  return `# ${config.name} — FLUX.2 [klein] LoRA dataset

Trigger word: \`${config.triggerToken}\`
Base model: \`${config.baseModel}\` (FLUX.2 [klein] 9B)

This folder is a ready-to-train LoRA dataset. Images and their same-basename
\`.txt\` caption sidecars live in \`./${config.datasetDir}/\`. Every caption contains
the trigger word \`${config.triggerToken}\`. The app does **not** run GPU training or
upload \`.safetensors\` — train externally, then upload the result in the BFL
Dashboard to obtain a \`finetune_id\` and register it in the app.

## 1. Train with AI-Toolkit

\`\`\`bash
git clone https://github.com/ostris/ai-toolkit.git
cd ai-toolkit
pip install -r requirements.txt

# copy this folder's "${config.datasetDir}/" and config.yaml into ai-toolkit/, then:
python run.py config.yaml
\`\`\`

Trained checkpoints land in \`./${config.outputDir}/${config.name}/\` as
\`.safetensors\` (one every ${config.saveEvery} steps, ${config.steps} total).

## 2. Quick local sanity check with Diffusers

\`\`\`python
import torch
from diffusers import Flux2Pipeline  # confirm the class/model id for your diffusers build

pipe = Flux2Pipeline.from_pretrained(
    "${config.baseModel}", torch_dtype=torch.bfloat16
).to("cuda")
pipe.load_lora_weights("${config.outputDir}/${config.name}/${config.name}.safetensors")

image = pipe(
    "${config.triggerToken}, studio product shot on a neutral background",
    num_inference_steps=28,
    guidance_scale=4.0,
    width=${config.resolution},
    height=${config.resolution},
).images[0]
image.save("sample.png")
\`\`\`

> The exact Diffusers pipeline class and HF model id track the FLUX.2 release —
> verify them against the model card for your installed \`diffusers\` version.

## 3. Hosted inference in this app

After uploading the \`.safetensors\` in the BFL Dashboard, register the returned
\`finetune_id\` via \`POST /api/finetunes\`, then generate with it through
\`POST /api/bfl/generate\` (\`finetuneId\` + optional \`finetuneStrength\`, 0..2,
default 1.2). Outputs land in the gallery like any other generation.
`;
}

export function buildKleinLoraDataset(
  collection: TrainingCollection,
  options: KleinLoraConfigOptions = {}
): KleinLoraDataset {
  const config = resolveKleinLoraConfig(collection, options);
  const triggerToken = config.triggerToken;
  const items = Array.isArray(collection.items) ? collection.items : [];
  if (items.length === 0) throw new Error("Collection has no items to export.");
  if (items.length > MAX_DATASET_ITEMS) {
    throw new Error(`Collection has ${items.length} items; the klein LoRA dataset is capped at ${MAX_DATASET_ITEMS}.`);
  }
  const files: KleinLoraDatasetFile[] = [];

  items.forEach((item, index) => {
    const number = String(index + 1).padStart(2, "0");
    const baseName = `${number}_${slugify(item.name || item.fileName || "image") || "image"}`;
    const { bytes, ext } = decodeImageDataUrl(
      item.imageDataUrl,
      `Item ${index + 1} (${item.name || item.fileName || "image"})`
    );
    files.push({ name: `${config.datasetDir}/${baseName}.${ext}`, content: bytes });
    files.push({ name: `${config.datasetDir}/${baseName}.txt`, content: ensureCaptionTrigger(item.caption, triggerToken) });
  });

  files.push({ name: "config.yaml", content: buildKleinLoraConfigYaml(config) });
  files.push({ name: "README.md", content: buildKleinLoraReadme(config) });

  return {
    triggerToken,
    imageCount: items.length,
    datasetDir: config.datasetDir,
    configFileName: "config.yaml",
    readmeFileName: "README.md",
    config,
    files
  };
}

export function datasetToZipEntries(dataset: KleinLoraDataset): ZipEntry[] {
  const encoder = new TextEncoder();
  return dataset.files.map((file) => ({
    name: file.name,
    bytes: typeof file.content === "string" ? encoder.encode(file.content) : file.content
  }));
}

// Browser hook: build the dataset and download it as a single .zip.
export function exportKleinLoraDatasetZip(collection: TrainingCollection, options: KleinLoraConfigOptions = {}) {
  const dataset = buildKleinLoraDataset(collection, options);
  const fileName = `${slugify(collection.name) || "klein-lora-dataset"}.zip`;
  downloadZip(datasetToZipEntries(dataset), fileName);
  return dataset;
}
