import type {
  PromptMediaType,
  PromptProvenance,
  PromptRecord,
  VideoPromptBeat,
  VideoPromptCategory,
  VideoPromptStructure
} from "./types";

/**
 * Additive media metadata for prompt records.
 *
 * One shared persistence model carries image, video, shared, and audio prompts.
 * Every field here is optional: a record saved before this shipped has none of
 * them, stays valid untouched, and reads back as an image prompt. Normalization
 * drops unknown values rather than rejecting a record, so an older or
 * hand-edited library file can never fail to load.
 */

export const PROMPT_MEDIA_TYPES: PromptMediaType[] = ["image", "video", "shared", "audio"];
export const VIDEO_PROMPT_CATEGORIES_IDS: VideoPromptCategory[] = ["simple", "detailed", "sequence", "dialogue_sound"];

/** Domain used by prompts saved into the Video library. */
export const VIDEO_PROMPT_DOMAIN = "video_prompts";
/** Domain used by audio sequence prompts (pre-existing). */
export const AUDIO_PROMPT_DOMAIN = "audio_sequences";

/** The additive keys, so a save can strip-then-renormalize them in one place. */
export const PROMPT_MEDIA_FIELDS = ["mediaType", "videoCategory", "tags", "videoStructure", "provenance"] as const;

export type PromptMediaFields = Pick<PromptRecord, (typeof PROMPT_MEDIA_FIELDS)[number]>;

export function normalizePromptMediaType(value: unknown): PromptMediaType | undefined {
  return typeof value === "string" && (PROMPT_MEDIA_TYPES as string[]).includes(value)
    ? (value as PromptMediaType)
    : undefined;
}

export function normalizeVideoCategory(value: unknown): VideoPromptCategory | undefined {
  return typeof value === "string" && (VIDEO_PROMPT_CATEGORIES_IDS as string[]).includes(value)
    ? (value as VideoPromptCategory)
    : undefined;
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.length ? tags : undefined;
}

function normalizeBeats(value: unknown): VideoPromptBeat[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const beats: VideoPromptBeat[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Record<string, unknown>;
    const text = typeof source.text === "string" ? source.text.trim() : "";
    if (!text) continue;
    const beat: VideoPromptBeat = { text };
    if (typeof source.start === "number" && Number.isFinite(source.start)) beat.start = source.start;
    if (typeof source.end === "number" && Number.isFinite(source.end)) beat.end = source.end;
    beats.push(beat);
  }
  return beats.length ? beats : undefined;
}

function normalizeSection(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

export function normalizeVideoStructure(value: unknown): VideoPromptStructure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const structure: VideoPromptStructure = {};
  const setup = normalizeSection(source.setup);
  const camera = normalizeSection(source.camera);
  const dialogue = normalizeSection(source.dialogue);
  const sound = normalizeSection(source.sound);
  const ambience = normalizeSection(source.ambience);
  const beats = normalizeBeats(source.beats);
  if (setup) structure.setup = setup;
  if (beats) structure.beats = beats;
  if (camera) structure.camera = camera;
  if (dialogue) structure.dialogue = dialogue;
  if (sound) structure.sound = sound;
  if (ambience) structure.ambience = ambience;
  return Object.keys(structure).length ? structure : undefined;
}

export function normalizePromptProvenance(value: unknown): PromptProvenance | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const provenance: PromptProvenance = {};
  for (const key of ["generationId", "evaluationId", "templateId", "model", "endpoint", "operation", "verdict", "outputPath", "capturedAt"] as const) {
    const text = normalizeSection(source[key]);
    if (text) provenance[key] = text;
  }
  if (typeof source.rating === "number" && Number.isFinite(source.rating)) provenance.rating = source.rating;
  const assetIds = normalizeTags(source.sourceAssetIds);
  if (assetIds) provenance.sourceAssetIds = assetIds;
  if (source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)) {
    provenance.settings = source.settings as Record<string, unknown>;
  }
  return Object.keys(provenance).length ? provenance : undefined;
}

/**
 * Valid media fields present on the input, and nothing else. A record with no
 * media metadata returns `{}` so saving it never adds keys it did not have.
 */
export function normalizePromptMediaFields(input: unknown): PromptMediaFields {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const fields: PromptMediaFields = {};
  const mediaType = normalizePromptMediaType(source.mediaType);
  const videoCategory = normalizeVideoCategory(source.videoCategory);
  const tags = normalizeTags(source.tags);
  const videoStructure = normalizeVideoStructure(source.videoStructure);
  const provenance = normalizePromptProvenance(source.provenance);
  if (mediaType) fields.mediaType = mediaType;
  if (videoCategory) fields.videoCategory = videoCategory;
  if (tags) fields.tags = tags;
  if (videoStructure) fields.videoStructure = videoStructure;
  if (provenance) fields.provenance = provenance;
  return fields;
}

/** The record without any media fields, valid or not. */
export function withoutPromptMediaFields<T extends Record<string, unknown>>(record: T): T {
  const copy = { ...record };
  for (const field of PROMPT_MEDIA_FIELDS) delete copy[field];
  return copy;
}

/**
 * Resolved media type. Explicit wins; otherwise the domain decides, and
 * everything else is an image prompt — which is what every legacy record is.
 */
export function promptMediaType(record: Pick<PromptRecord, "mediaType" | "domain">): PromptMediaType {
  const explicit = normalizePromptMediaType(record.mediaType);
  if (explicit) return explicit;
  if (record.domain === VIDEO_PROMPT_DOMAIN) return "video";
  if (record.domain === AUDIO_PROMPT_DOMAIN) return "audio";
  return "image";
}

const TIMED_BEAT_PATTERN = /(^|\n|\s)\d+(\.\d+)?\s*s\s*[:\-–]/;
const DIALOGUE_PATTERN = /(^|\n)\s*(voice-?over|vo|dialogue)\b|\bsays?\s*:|["“][^"”]{3,}["”]/i;
const SOUND_PATTERN = /\b(sound|sfx|room tone|ambience|ambient|foley)\b\s*:/i;

/**
 * Best-effort category for a prompt with no explicit one — used when a prompt is
 * promoted from a rated generation or saved off a FLUX.3 asset. Timed beats win
 * over dialogue, dialogue over length, and anything short is simple.
 */
export function inferVideoCategory(text: string): VideoPromptCategory {
  const prompt = (text || "").trim();
  if (!prompt) return "simple";
  if (TIMED_BEAT_PATTERN.test(prompt)) return "sequence";
  if (DIALOGUE_PATTERN.test(prompt) || SOUND_PATTERN.test(prompt)) return "dialogue_sound";
  const words = prompt.split(/\s+/).length;
  if (words > 45 || prompt.split("\n").filter((line) => line.trim()).length > 2) return "detailed";
  return "simple";
}

/** Explicit category, or an inference from the prompt text. */
export function promptVideoCategory(record: Pick<PromptRecord, "videoCategory" | "prompt">): VideoPromptCategory {
  return normalizeVideoCategory(record.videoCategory) || inferVideoCategory(record.prompt || "");
}

export function promptIdSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);
}

/**
 * A captured generation, structurally. Declared here rather than imported so the
 * prompt layer never depends on the evaluation read model;
 * `GenerationEvaluationRecord` satisfies this shape.
 */
export type PromotableGeneration = {
  id: string;
  title?: string;
  createdAt?: string;
  mediaType?: string;
  model?: string;
  endpoint?: string;
  operation?: string;
  prompt: { text: string; sourceIds?: string[] };
  settings?: Record<string, unknown>;
  providerRequest?: { id?: string };
  sources?: { assetIds?: string[] };
  output?: { localPath?: string };
  annotation: { rating?: number; verdict: string; tags?: string[] };
};

/** Only a kept generation with prompt text can become a library record. */
export function canPromoteGeneration(record: PromotableGeneration): boolean {
  return record.annotation.verdict === "keep" && Boolean(record.prompt.text?.trim());
}

/**
 * Promotes a rated generation into a Video library record, carrying the
 * provenance that makes the library a record of prompts that demonstrably
 * worked: source generation id, sanitized settings, and the rating.
 */
export function videoPromptRecordFromEvaluation(record: PromotableGeneration): PromptRecord {
  const text = (record.prompt.text || "").trim();
  const tags = normalizeTags([...(record.annotation.tags || []), "promoted"]) || ["promoted"];
  const provenance: PromptProvenance = {
    generationId: record.providerRequest?.id || record.id,
    evaluationId: record.id,
    verdict: record.annotation.verdict,
    capturedAt: record.createdAt || new Date().toISOString()
  };
  if (record.model) provenance.model = record.model;
  if (record.endpoint) provenance.endpoint = record.endpoint;
  if (record.operation) provenance.operation = record.operation;
  if (typeof record.annotation.rating === "number") provenance.rating = record.annotation.rating;
  if (record.settings) provenance.settings = record.settings;
  if (record.output?.localPath) provenance.outputPath = record.output.localPath;
  const assetIds = normalizeTags(record.sources?.assetIds);
  if (assetIds) provenance.sourceAssetIds = assetIds;

  return {
    id: `${promptIdSlug(`video_keep_${record.title || record.id}`) || "video_keep"}_${record.id.slice(-6)}`,
    domain: VIDEO_PROMPT_DOMAIN,
    species: record.model || "flux-3-video",
    prompt: text,
    prompt_format: "text",
    mediaType: "video",
    videoCategory: inferVideoCategory(text),
    tags,
    provenance
  };
}
