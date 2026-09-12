import { assetRecipe, recipeSource, type GenerationRecipe } from "./generation-recipe";
import { FLUX3_ASPECT_RATIOS, type Flux3InputMedia, type Flux3SourceMode, type Flux3VideoAspectRatio } from "./flux3-video";
import { getBflModel } from "./provider-registry";
import { normalizeReferenceRole } from "./reference-roles";
import { stripReferenceCue } from "./prompt-utils";
import type { AssetRecord, ReferenceImage } from "./types";

export type RecreationSeed = { recipe: GenerationRecipe; nonce: number };
export const numberSetting = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
export const textSetting = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
export const booleanSetting = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function mergedAssetRecipe(asset: AssetRecord, saved?: GenerationRecipe | null): GenerationRecipe {
  const base = assetRecipe(asset);
  return saved ? { ...saved, body: { ...base.body, ...Object.fromEntries(Object.entries(saved.body).filter(([,value]) => value !== undefined)) } } : base;
}

export function imageRecreation(asset: AssetRecord, recipe: GenerationRecipe, assets: AssetRecord[]) {
  const b = recipe.body;
  const metadata = list(b.referenceMeta), inputs = list(b.references);
  const references: ReferenceImage[] = Array.from({ length: Math.max(metadata.length, inputs.length) }, (_, index) => {
    const m = (metadata[index] && typeof metadata[index] === "object" ? metadata[index] : {}) as Partial<ReferenceImage>;
    const original = assets.find(item => item.id === m.assetId);
    return { id: `recreate-${asset.id}-${index}`, name: m.name || `Reference ${index + 1}`, role: normalizeReferenceRole(m.role, index),
      targetId: m.targetId, assetId: m.assetId,
      value: recipeSource(inputs[index]) || recipeSource(m.value) || (original && recipeSource(original.imageDataUrl || original.imageUrl || original.sampleUrl)) ||
        (m.assetId ? `/api/outputs/${encodeURIComponent(m.assetId)}/image` : "") };
  });
  const knownModel = textSetting(b.model, asset.model);
  return {
    prompt: textSetting(b.originalPrompt, stripReferenceCue(textSetting(b.prompt, asset.prompt))),
    model: getBflModel(knownModel)?.value || "pro-preview",
    width: numberSetting(b.width, 1024), height: numberSetting(b.height, 1024),
    seed: typeof b.seed === "number" ? String(b.seed) : "",
    promptUpsampling: booleanSetting(b.promptUpsampling, true), normalizeReferences: booleanSetting(b.normalizeReferences, true),
    referenceCue: textSetting(b.referenceCue), referenceWeight: numberSetting(b.referenceWeight, 80), references,
    missing: references.filter(ref => !ref.value).length
  };
}

export function flux3Recreation(recipe: GenerationRecipe) {
  const b = recipe.body;
  const mode: Flux3SourceMode = ["i2v", "v2v"].includes(textSetting(b.mode)) ? b.mode as Flux3SourceMode : "t2v";
  const timed = list(b.timedKeyframes).filter((pair): pair is [number, string] => Array.isArray(pair) && typeof pair[0] === "number" && typeof pair[1] === "string");
  const inputs = timed.length ? timed.map(pair => pair[1]) : list(b.keyframes);
  const ids = list(b.keyframeAssetIds);
  const keyframes: Flux3InputMedia[] = inputs.map((source, index) => ({
    id: `recreate-frame-${index}`, name: `Frame ${index + 1}`, kind: "image", source: recipeSource(source),
    assetId: textSetting(ids[index]) || undefined, seconds: timed[index]?.[0]
  }));
  const startVideo: Flux3InputMedia | null = recipeSource(b.startVideo) ? { id: "recreate-continuation", name: "Original continuation clip", kind: "video",
    source: recipeSource(b.startVideo), assetId: textSetting(b.startVideoAssetId) || undefined } : null;
  return { mode, keyframes, startVideo, prompt: textSetting(b.prompt),
    aspectRatio: FLUX3_ASPECT_RATIOS.includes(b.aspectRatio as Flux3VideoAspectRatio) ? b.aspectRatio as Flux3VideoAspectRatio : "auto" as const,
    duration: typeof b.duration === "number" ? b.duration : "auto" as const,
    resolution: b.resolution === "fhd" ? "fhd" as const : "hd" as const,
    generateAudio: booleanSetting(b.generateAudio, true), safetyTolerance: numberSetting(b.safetyTolerance, 2), draft: booleanSetting(b.draft, false),
    missing: mode === "i2v" ? Math.max(keyframes.filter(frame => !frame.source).length, keyframes.length ? 0 : 1) : mode === "v2v" && !startVideo ? 1 : 0
  };
}

export function recreationInputAsset(output: AssetRecord, source: string, role: string, original?: AssetRecord): AssetRecord | null {
  if (original) return original;
  if (!recipeSource(source)) return null;
  return { id: `recreate-${output.id}-${role}`, title: `Original ${role} · ${output.title || output.id}`, createdAt: output.createdAt,
    timestamp: output.timestamp, imageDataUrl: source, imageUrl: source, image_url: source, sampleUrl: source,
    model: "saved-input", prompt: "", status: "complete", assetKind: "input", mediaType: "image", payload: {}, references: [] };
}
