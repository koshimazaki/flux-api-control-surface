import { restoreCompiledBoxes } from "@/lib/recreate-boxes";
import { normalizeFlux3ImageDraft, type Flux3ImageDraft } from "@/lib/flux3-image-draft";
import { normalizeFlux3ImageSettings } from "@/lib/flux3-image";
import type { AssetRecord, ReferenceImage } from "@/lib/types";

export type RecreationSeed = { asset: AssetRecord; nonce: number };
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const sourceUrl = (value: unknown): string => typeof value === "string" && (/^https?:\/\//i.test(value) || value.startsWith("/api/") || value.startsWith("data:image/") || value.startsWith("data:video/")) ? value : "";

export function recreationReferences(asset: AssetRecord): ReferenceImage[] {
  return (asset.references || []).map((reference) => ({ ...reference,
    value: sourceUrl(reference.value) || (reference.assetId ? `/api/outputs/${encodeURIComponent(reference.assetId)}/image` : "")
  })).filter((reference) => Boolean(reference.value));
}

/** Recover old runs conservatively; new runs retain the exact uncompiled draft and box geometry. */
export function recreateImageDraft(asset: AssetRecord): { draft: Flux3ImageDraft; warnings: string[] } {
  const saved = record(asset.runSettings?.flux3Image);
  const refs = recreationReferences(asset);
  const source = asset.sourceAssetId || null;
  const mode = saved.mode || (source ? "edit" : refs.length ? "i2i" : "t2i");
  const warnings: string[] = [];
  const draft = saved.draft ? normalizeFlux3ImageDraft(saved.draft) : normalizeFlux3ImageDraft({
    mode, prompts: { [String(mode)]: asset.prompt },
    references: refs.map((ref) => ref.assetId || ref.id), regionSourceId: source, regionFrame: saved.frame,
    settings: { ...record(saved.settings), model: asset.model, seed: asset.seed ?? asset.payload.seed }
  });
  draft.settings = normalizeFlux3ImageSettings({ ...draft.settings, seed: asset.seed ?? draft.settings.seed });
  const expected = Number(saved.imageCount ?? asset.runSettings?.referenceCount ?? 0);
  if (expected > refs.length && !saved.draft) warnings.push("Some original references were not saved.");
  const recoveredBoxes = !saved.draft && restoreCompiledBoxes(asset.prompt, draft, refs);
  if (Number(saved.boxes) > 0 && !saved.draft && !recoveredBoxes) warnings.push("This older result has no saved box geometry; redraw its boxes before generating.");
  if ((draft.mode === "edit" || draft.mode === "precise") && !source && !draft.regionSourceId) warnings.push("The original source image is missing.");
  return { draft, warnings };
}

/** Reference-only assets let the generator resolve original inputs that are outside the loaded gallery page. */
export function referenceAssets(asset: AssetRecord): AssetRecord[] {
  return recreationReferences(asset).map((ref) => ({
    ...asset, id: ref.assetId || ref.id, title: ref.name, mediaType: "image", assetKind: "input", prompt: "", model: "reference",
    imageDataUrl: ref.value.startsWith("data:") ? ref.value : "", imageUrl: ref.value, image_url: ref.value, sampleUrl: ref.value,
    videoUrl: undefined, payload: {}, references: [], runSettings: undefined, sourceAssetId: null, operation: null
  }));
}
