import { useEffect, useState } from "react";
import type { Size } from "@/lib/canvas-geometry";
import {
  FLUX3_IMAGE_MAX_REFERENCES,
  compactReferenceIds,
  defaultFlux3ImageSettings,
  normalizeFlux3ImageSettings,
  type Flux3ImageMode,
  type Flux3ImageRegion,
  type Flux3ImageSettings
} from "@/lib/flux3-image";
import { normalizeBoxRegion } from "@/lib/flux3-image-boxes";

export const FLUX3_IMAGE_DRAFT_KEY = "bfl-flux3-image-draft";
/** Sent after something outside the workspace (the gallery) changes the stored draft. */
export const FLUX3_IMAGE_DRAFT_EVENT = "bfl-flux3-image-draft-changed";

export type Flux3ImageDraft = {
  mode: Flux3ImageMode;
  /** The prompt for text to image, image to image and a whole-image edit; the overall instruction for precise. */
  prompts: Record<"t2i" | "i2i" | "edit" | "precise", string>;
  /** Image to image: asset ids per reference slot, null when empty. */
  references: (string | null)[];
  /** Precise boxes, in the source image's pixels, so they belong to one source. */
  regions: Flux3ImageRegion[];
  regionSourceId: string | null;
  /** The source's pixel size when its boxes were drawn: what converts them to BFL's 0–1000 grid. */
  regionFrame: Size | null;
  /** Text to image: lay the image out with boxes on a frame of the chosen aspect ratio. */
  layoutEnabled: boolean;
  /** Layout boxes, in the layout frame's pixels. */
  layoutRegions: Flux3ImageRegion[];
  /** Published API settings: aspect ratio, resolution tier, grounding, safety tolerance. */
  settings: Flux3ImageSettings;
};

export const defaultFlux3ImageDraft: Flux3ImageDraft = {
  mode: "t2i",
  prompts: { t2i: "", i2i: "", edit: "", precise: "" },
  references: Array.from({ length: FLUX3_IMAGE_MAX_REFERENCES }, () => null),
  regions: [],
  regionSourceId: null,
  regionFrame: null,
  layoutEnabled: false,
  layoutRegions: [],
  settings: defaultFlux3ImageSettings
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asSize(value: unknown): Size | null {
  const record = asRecord(value);
  const [width, height] = [Number(record.width), Number(record.height)];
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
}

const boxes = (value: unknown) =>
  (Array.isArray(value) ? value : []).map(normalizeBoxRegion).filter((region): region is Flux3ImageRegion => !!region);

/**
 * Reads a stored draft defensively. Drafts from before the API kept regions
 * under `boxes`, drew lasso and brush shapes, and had painting tools: the
 * regions come back as boxes and the tools are dropped.
 */
export function normalizeFlux3ImageDraft(value: unknown): Flux3ImageDraft {
  const record = asRecord(value);
  const prompts = asRecord(record.prompts);
  const mode = record.mode === "i2i" || record.mode === "edit" || record.mode === "precise" ? record.mode : "t2i";
  return {
    mode,
    prompts: { t2i: asText(prompts.t2i), i2i: asText(prompts.i2i), edit: asText(prompts.edit), precise: asText(prompts.precise) },
    // Saved drafts could have gaps; numbers on screen must match the images sent.
    references: compactReferenceIds(
      Array.from({ length: FLUX3_IMAGE_MAX_REFERENCES }, (_, index) => {
        const id = Array.isArray(record.references) ? record.references[index] : null;
        return typeof id === "string" && id ? id : null;
      })
    ),
    regions: boxes(Array.isArray(record.regions) ? record.regions : record.boxes),
    regionSourceId:
      typeof record.regionSourceId === "string"
        ? record.regionSourceId
        : typeof record.boxSourceId === "string"
          ? record.boxSourceId
          : null,
    regionFrame: asSize(record.regionFrame),
    layoutEnabled: record.layoutEnabled === true,
    layoutRegions: boxes(record.layoutRegions),
    settings: normalizeFlux3ImageSettings(record.settings)
  };
}

function readStoredDraft() {
  return normalizeFlux3ImageDraft(JSON.parse(localStorage.getItem(FLUX3_IMAGE_DRAFT_KEY) || "null"));
}

/**
 * Changes the stored draft from outside the workspace, such as a gallery
 * button, and tells an open workspace to pick it up. Returns null when
 * browser storage is unavailable.
 */
export function updateStoredFlux3ImageDraft<T extends { draft: Flux3ImageDraft }>(change: (draft: Flux3ImageDraft) => T): T | null {
  try {
    const result = change(readStoredDraft());
    localStorage.setItem(FLUX3_IMAGE_DRAFT_KEY, JSON.stringify(result.draft));
    window.dispatchEvent(new Event(FLUX3_IMAGE_DRAFT_EVENT));
    return result;
  } catch {
    return null;
  }
}

/** FLUX 3 Image workspace state, kept in local storage so it survives tab switches. */
export function useFlux3ImageDraft(sourceId: string | null) {
  const [draft, setDraft] = useState<Flux3ImageDraft>(defaultFlux3ImageDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        setDraft(readStoredDraft());
      } catch {
        /* keep the current draft */
      }
    };
    load();
    setHydrated(true);
    // The gallery can add references while the workspace is open.
    window.addEventListener(FLUX3_IMAGE_DRAFT_EVENT, load);
    return () => window.removeEventListener(FLUX3_IMAGE_DRAFT_EVENT, load);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(FLUX3_IMAGE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* the draft cache is non-critical */
    }
  }, [draft, hydrated]);

  // A different source image invalidates boxes drawn in the old one's
  // pixels. No source (still loading after a reload, or cleared) keeps them.
  useEffect(() => {
    if (!hydrated || !sourceId) return;
    setDraft((current) =>
      current.regionSourceId === sourceId ? current : { ...current, regions: [], regionSourceId: sourceId, regionFrame: null }
    );
  }, [hydrated, sourceId]);

  function update(patch: Partial<Flux3ImageDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return { draft, update, setDraft };
}
