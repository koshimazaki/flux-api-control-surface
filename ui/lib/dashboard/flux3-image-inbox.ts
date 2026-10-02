import type { Flux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import { placeReferenceIds } from "@/lib/flux3-image";

/**
 * What the gallery's FLUX 3 Image buttons do to the workspace draft: the edit
 * button opens the image as the source, and each click on the other two fills
 * the next free spot, so a run of clicks lays images out in order.
 */
export type Flux3ImageInboxResult = { draft: Flux3ImageDraft; added: boolean; message: string };
/** Which gallery button: the edit source, a FLUX 3 Image reference slot, or a box's reference. */
export type Flux3ImageGalleryTarget = "source" | "reference" | "box";

/**
 * Edit: the image becomes the source, as a whole-image edit until a box is
 * drawn on it. Boxes already drawn on this same image are kept.
 */
export function openAsEditSource(draft: Flux3ImageDraft, assetId: string, label: string): Flux3ImageInboxResult {
  const keepsBoxes = draft.regionSourceId === assetId && draft.regions.length > 0;
  return {
    draft: { ...draft, mode: keepsBoxes ? "precise" : "edit" },
    added: true,
    message: `Loaded ${label} as the FLUX 3 Image edit source.`
  };
}

/** Image to image: the image goes into the first empty reference slot. */
export function addAsNextReference(draft: Flux3ImageDraft, assetId: string, label: string): Flux3ImageInboxResult {
  const opened = { ...draft, mode: "i2i" as const };
  const existing = draft.references.indexOf(assetId);
  if (existing !== -1) return { draft: opened, added: false, message: `${label} is already FLUX 3 Image reference ${existing + 1}.` };
  const free = draft.references.findIndex((id) => !id);
  if (free === -1) {
    return { draft: opened, added: false, message: "All ten FLUX 3 Image references are full. Remove one before adding another." };
  }
  return {
    draft: { ...opened, references: placeReferenceIds(draft.references, [assetId], free) },
    added: true,
    message: `Added ${label} as FLUX 3 Image reference ${free + 1}.`
  };
}

/** Precise edits: the image becomes the reference of the next Change box that has none. */
export function addAsNextBoxReference(draft: Flux3ImageDraft, assetId: string, label: string): Flux3ImageInboxResult {
  const index = draft.regions.findIndex((region) => region.action === "change" && !region.referenceId);
  if (index === -1) {
    const message = draft.regions.some((region) => region.action === "change")
      ? "Every Change box already has a reference. Draw another box, or clear a box's reference first."
      : "Draw a Change box on the image first; each click then gives the next box without a reference this image.";
    return { draft: draft.regions.length ? { ...draft, mode: "precise" } : draft, added: false, message };
  }
  return {
    draft: {
      ...draft,
      mode: "precise",
      regions: draft.regions.map((region, slot) => (slot === index ? { ...region, referenceId: assetId } : region))
    },
    added: true,
    message: `Added ${label} as the reference for box ${index + 1}.`
  };
}
