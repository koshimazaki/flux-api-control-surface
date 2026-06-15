import { readBflPngMetadata } from "@/lib/png-metadata-client";
import type { AssetRecord } from "@/lib/types";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");

  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function fileToDataUrl(file: File) {
  const buffer = await file.arrayBuffer();
  return `data:${file.type || "image/png"};base64,${bytesToBase64(new Uint8Array(buffer))}`;
}

function titleFromFile(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || fileName || "Imported PNG";
}

function importedId(file: File, full: Record<string, any>, compact: Record<string, any>) {
  return asString(full.id) || asString(compact.requestId) || `png-${file.name}-${file.size}-${file.lastModified}`;
}

export async function assetFromPngMetadataFile(file: File): Promise<AssetRecord> {
  const [metadata, imageDataUrl] = await Promise.all([readBflPngMetadata(file), fileToDataUrl(file)]);
  const full = asRecord(metadata.full);
  const compact = asRecord(metadata.prompt);
  const payload = asRecord(full.payload);
  const submit = asRecord(full.submit);
  const runSettings = asRecord(full.runSettings || compact.runSettings);
  const prompt = asString(payload.prompt) || asString(compact.prompt);

  if (!prompt && !Object.keys(full).length && !Object.keys(compact).length) {
    throw new Error(`${file.name} does not include BFLPrompt or BFLMetadata PNG metadata.`);
  }

  const width = asNumber(payload.width) || asNumber(compact.width);
  const height = asNumber(payload.height) || asNumber(compact.height);
  const seed = asNumber(payload.seed) ?? asNumber(compact.seed);
  const sampleUrl = asString(full.sampleUrl) || asString(compact.sampleUrl) || imageDataUrl;
  const model = asString(full.model) || asString(compact.model) || asString(runSettings.model) || "bfl-png";
  const timestamp = Date.now();

  return {
    id: importedId(file, full, compact),
    title: titleFromFile(file.name),
    createdAt: new Date(timestamp).toISOString(),
    timestamp,
    imageDataUrl,
    imageUrl: sampleUrl,
    image_url: sampleUrl,
    sampleUrl,
    model,
    prompt,
    status: "complete",
    width,
    height,
    seed,
    aspectRatio: width && height ? `${width}:${height}` : undefined,
    provider: asString(full.provider) || "bfl-png",
    payload: Object.keys(payload).length
      ? payload
      : {
          prompt,
          width,
          height,
          seed,
          output_format: asString(compact.outputFormat) || "png"
        },
    references: [],
    runSettings: Object.keys(runSettings).length ? runSettings : undefined,
    costCredits: asNumber(submit.cost) ?? asNumber(submit.creditDelta) ?? null,
    inputMp: asNumber(submit.inputMp) ?? null,
    outputMp: asNumber(submit.outputMp) ?? null,
    creditsBefore: asNumber(submit.creditsBefore) ?? null,
    creditsAfter: asNumber(submit.creditsAfter) ?? null,
    creditDelta: asNumber(submit.creditDelta) ?? null,
    localImagePath: asString(full.outputFiles?.imagePath) || null,
    localPromptPath: asString(full.outputFiles?.promptPath) || null,
    localMetadataPath: asString(full.outputFiles?.metadataPath) || null,
    remoteImageKey: asString(full.outputFiles?.remote?.outputFiles?.r2ImageKey) || null,
    remotePromptKey: asString(full.outputFiles?.remote?.outputFiles?.r2PromptKey) || null,
    remoteMetadataKey: asString(full.outputFiles?.remote?.outputFiles?.r2MetadataKey) || null,
    remoteImageUrl: asString(full.outputFiles?.remote?.outputFiles?.remoteImageUrl) || null,
    r2RootPrefix: asString(full.outputFiles?.remote?.outputFiles?.r2RootPrefix) || null,
    sourceAssetId: asString(full.sourceAssetId) || null,
    operation: asString(full.operation) || null
  };
}
