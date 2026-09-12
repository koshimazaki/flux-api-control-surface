import type { AssetRecord } from "./types";

export type GenerationRecipe = {
  version: 1;
  kind: "image" | "video" | "tool";
  operation: string;
  body: Record<string, unknown>;
};

// Explicit request fields only: credentials, queue controls and provider responses
// never belong in a reusable generation recipe.
export const RECIPE_FIELDS = [
  "model", "title", "prompt", "originalPrompt", "referenceCue", "width", "height", "seed", "outputFormat",
  "promptUpsampling", "safetyTolerance", "references", "referenceMeta", "referenceWeight", "normalizeReferences",
  "finetuneId", "finetuneStrength", "mode", "keyframes", "timedKeyframes", "keyframeAssetIds", "startVideo",
  "startVideoAssetId", "draftCacheId", "aspectRatio", "duration", "resolution", "generateAudio", "draft",
  "inputVideo", "upscaleFactor", "creativity", "sourceAssetId", "sourceName", "sourceWidth", "sourceHeight",
  "durationSeconds", "tool", "image", "mask", "garment", "garments", "garmentAssetIds", "garmentTitles",
  "dilatePixels", "canvasWidth", "canvasHeight", "offsetX", "offsetY", "guidance", "steps", "autoCrop"
] as const;

export function recipeSource(value: unknown): string {
  return typeof value === "string" && /^(\/[^/]|https?:\/\/|data:(image|video)\/)/i.test(value) ? value : "";
}

export function assetRecipe(asset: AssetRecord): GenerationRecipe {
  const p = asset.payload || {}, s = asset.runSettings || {};
  const operation = asset.operation || String(s.tool || p.tool || (asset.mediaType === "video" ? p.mode || "t2v" : "generate"));
  const kind = asset.mediaType === "video" ? "video" : ["erase", "vto", "outpaint", "deblur"].includes(operation) ? "tool" : "image";
  return { version: 1, kind, operation, body: {
    model: asset.model, prompt: asset.prompt, width: asset.width ?? p.width, height: asset.height ?? p.height,
    seed: asset.seed ?? p.seed ?? s.seed, promptUpsampling: s.promptUpsampling ?? p.prompt_upsampling,
    outputFormat: s.outputFormat ?? p.output_format, safetyTolerance: p.safety_tolerance ?? s.safetyTolerance,
    references: asset.references.map(ref => recipeSource(ref.value) || (ref.assetId ? `/api/outputs/${encodeURIComponent(ref.assetId)}/image` : "")),
    referenceMeta: asset.references, referenceWeight: s.referenceWeight, normalizeReferences: s.normalizeReferences,
    mode: p.mode ?? s.mode ?? operation, duration: p.duration, aspectRatio: p.aspect_ratio,
    resolution: p.resolution, generateAudio: p.generate_audio, draft: p.draft,
    inputVideo: kind === "video" && ["video-edit", "video-upscale"].includes(operation)
      ? `/api/bfl/${operation}/${encodeURIComponent(asset.id)}?kind=source` : undefined,
    upscaleFactor: p.upscale_factor, creativity: p.creativity, sourceAssetId: asset.sourceAssetId,
    garmentAssetIds: s.garmentAssetIds, tool: operation, canvasWidth: p.width, canvasHeight: p.height,
    offsetX: p.reference_offset_x, offsetY: p.reference_offset_y, autoCrop: p.auto_crop,
    dilatePixels: p.dilate_pixels, guidance: p.guidance, steps: p.steps
  } };
}

export function canRecreateAsset(asset: AssetRecord) {
  return !["input", "reference", "asset"].includes(asset.assetKind || "") &&
    asset.operation !== "video-trim" && asset.model !== "local-ffmpeg-trim";
}
