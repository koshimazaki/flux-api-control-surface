import type { Flux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import type { Flux3ImageMode, Flux3ImageRequest } from "@/lib/flux3-image";
import { layoutFrameSize } from "@/lib/flux3-image-boxes";

export const flux3ImageModeTitles: Record<Flux3ImageMode, string> = {
  t2i: "Text to image",
  i2i: "Image to image",
  edit: "Image edit",
  precise: "Edit with boxes"
};

/**
 * The request a draft makes in its current mode. `source` is the loaded edit
 * source and `sourceOf` resolves a library asset id to an image the route can
 * read; references that no longer resolve are left out.
 */
export function flux3ImageRequestFor(
  draft: Flux3ImageDraft,
  source: string | undefined,
  sourceOf: (id: string | null | undefined) => string | undefined
): Flux3ImageRequest {
  const settings = draft.settings;
  if (draft.mode === "t2i") {
    if (!draft.layoutEnabled) return { mode: "t2i", prompt: draft.prompts.t2i, settings };
    // Layout rows have no references; only where each element goes and what it is.
    const layout = draft.layoutRegions.map((region) => ({ ...region, referenceId: undefined, reference: undefined }));
    return { mode: "t2i", prompt: draft.prompts.t2i, layout, frame: layoutFrameSize(settings.aspectRatio), settings };
  }
  if (draft.mode === "i2i") {
    const references = draft.references.map(sourceOf).filter((item): item is string => !!item);
    return { mode: "i2i", prompt: draft.prompts.i2i, references, settings };
  }
  if (draft.mode === "edit") return { mode: "edit", source, prompt: draft.prompts.edit, settings };
  const regions = draft.regions.map(({ referenceId, ...region }) => ({ ...region, reference: sourceOf(referenceId) }));
  return { mode: "precise", source, prompt: draft.prompts.precise, regions, frame: draft.regionFrame ?? undefined, settings };
}

/** A gallery title from the prompt or the first box, or the mode when there is neither. */
export function flux3ImageRunTitle(draft: Flux3ImageDraft) {
  const { mode } = draft;
  const words = mode === "precise" ? draft.prompts.precise || draft.regions[0]?.prompt || "" : draft.prompts[mode];
  const text = words.trim().replace(/\s+/g, " ");
  return text ? `FLUX 3 Image: ${text.length > 56 ? `${text.slice(0, 55)}…` : text}` : `FLUX 3 Image: ${flux3ImageModeTitles[mode]}`;
}
