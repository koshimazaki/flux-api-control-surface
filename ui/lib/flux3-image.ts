import { clampValue, type Size } from "@/lib/canvas-geometry";

/**
 * FLUX 3 Image: text to image, image to image from reference images, edits
 * (whole image or an inpainted area), and precise edits split into regions,
 * each with its own prompt and optional reference image. The model's API is not published yet, so this module
 * holds only the client-side request shape, the blocker and the region
 * geometry. `FLUX3_IMAGE_API` stays null until BFL publishes the endpoint and
 * schema; nothing can be submitted before then, and no payload is guessed.
 */
export type Flux3ImageMode = "t2i" | "i2i" | "edit" | "precise";

/** How a precise-edit region was drawn. */
export type Flux3RegionKind = "box" | "lasso" | "paint";
/** A point inside a region's bounds, 0–1 on each axis, so resizing scales the shape. */
export type RegionPoint = [number, number];

/** One precise-edit region: bounds in source pixels, its shape, its edit and reference. */
export type Flux3ImageRegion = {
  id: string;
  kind: Flux3RegionKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Lasso outlines or brush strokes, relative to the bounds. Boxes have none. */
  paths?: RegionPoint[][];
  /** Brush diameter in source pixels, for painted regions. */
  brush?: number;
  /** Soft-edge radius in source pixels, for edges such as hair. */
  fuzz: number;
  prompt: string;
  /** Asset id of the region's reference image. */
  referenceId?: string | null;
};

/** A region as sent: its reference resolved to an image source. */
export type Flux3ImageRequestRegion = Omit<Flux3ImageRegion, "referenceId"> & { reference?: string };

/** Provisional UI limits until the API documents its own. */
export const FLUX3_IMAGE_FUZZ_MAX = 64;
export const FLUX3_IMAGE_DEFAULT_FUZZ = 8;
export const FLUX3_IMAGE_MIN_BOX = 8;
/** At least four references are supported; raise this once the API states its limit. */
export const FLUX3_IMAGE_MAX_REFERENCES = 4;

export type Flux3ImageRequest = {
  mode: Flux3ImageMode;
  /** The prompt for text to image, image to image, or an edit. */
  prompt?: string;
  /** Image to image: reference images in slot order, referred to as image 1, image 2… */
  references?: string[];
  /** Source image for edit and precise modes (data URL or dashboard URL). */
  source?: string;
  /** Edit: white-on-black inpaint mask at the source resolution; none edits the whole image. */
  mask?: string;
  /** Precise: the regions, each with its own prompt. */
  regions?: Flux3ImageRequestRegion[];
};

/** The published API, wired in once BFL documents it. */
export type Flux3ImageApi = {
  endpoint: string;
  toPayload: (request: Flux3ImageRequest) => Record<string, unknown>;
  estimateUsd?: (request: Flux3ImageRequest) => number | null;
};

export const FLUX3_IMAGE_API: Flux3ImageApi | null = null;

export const FLUX3_IMAGE_API_PENDING =
  "FLUX 3 Image is not in the API yet. This request is ready to wire once the endpoint is published.";

export function flux3ImageInputBlocker(input: Flux3ImageRequest) {
  if (input.mode === "t2i") return input.prompt?.trim() ? null : "Describe the image you want.";
  if (input.mode === "i2i") {
    const count = input.references?.filter(Boolean).length ?? 0;
    if (!count) return "Add at least one reference image.";
    if (count > FLUX3_IMAGE_MAX_REFERENCES) return `FLUX 3 Image takes up to ${FLUX3_IMAGE_MAX_REFERENCES} references here.`;
    return input.prompt?.trim() ? null : "Describe the image to make from the references.";
  }
  if (!input.source) return "Load a source image to edit.";
  if (input.mode === "edit") {
    if (input.prompt?.trim()) return null;
    return input.mask ? "Describe the edit for the painted area." : "Describe the edit.";
  }
  const regions = input.regions ?? [];
  if (!regions.length) return "Draw a region: a box, a brush stroke or a lasso.";
  const empty = regions.findIndex((region) => !region.prompt.trim());
  return empty === -1 ? null : `Type the edit into region ${empty + 1}.`;
}

/** The input problem first, then the missing API; null only when a request could be sent. */
export function flux3ImageRequestBlocker(input: Flux3ImageRequest, api: Flux3ImageApi | null = FLUX3_IMAGE_API) {
  return flux3ImageInputBlocker(input) ?? (api ? null : FLUX3_IMAGE_API_PENDING);
}

export function estimateFlux3ImageUsd(input: Flux3ImageRequest, api: Flux3ImageApi | null = FLUX3_IMAGE_API) {
  return api?.estimateUsd?.(input) ?? null;
}

export function buildFlux3ImagePayload(input: Flux3ImageRequest, api: Flux3ImageApi | null = FLUX3_IMAGE_API) {
  const blocker = flux3ImageRequestBlocker(input, api);
  if (blocker || !api) throw new Error(blocker || FLUX3_IMAGE_API_PENDING);
  return { endpoint: api.endpoint, payload: api.toPayload(input) };
}

/**
 * Places reference ids into fixed slots: the first replaces the target slot,
 * the rest fill empty slots in order. Ids that do not fit are dropped.
 */
export function placeReferenceIds(slots: (string | null)[], ids: string[], start: number) {
  const next = [...slots];
  ids.forEach((id, index) => {
    if (index === 0 && start >= 0 && start < next.length) {
      next[start] = id;
      return;
    }
    const free = next.findIndex((value) => !value);
    if (free !== -1) next[free] = id;
  });
  return next;
}

export type ImagePoint = { x: number; y: number };

/** A drag between two image points as a box clamped to the image, or null when too small. */
export function boxFromDrag(start: ImagePoint, end: ImagePoint, size: Size) {
  const left = clampValue(Math.min(start.x, end.x), 0, size.width);
  const top = clampValue(Math.min(start.y, end.y), 0, size.height);
  const right = clampValue(Math.max(start.x, end.x), 0, size.width);
  const bottom = clampValue(Math.max(start.y, end.y), 0, size.height);
  const box = {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
  return box.width >= FLUX3_IMAGE_MIN_BOX && box.height >= FLUX3_IMAGE_MIN_BOX ? box : null;
}

export function clampFuzz(value: number) {
  return Number.isFinite(value) ? Math.round(clampValue(value, 0, FLUX3_IMAGE_FUZZ_MAX)) : FLUX3_IMAGE_DEFAULT_FUZZ;
}

/**
 * Pixel-exact selection: every pixel of a composed white-on-black mask becomes
 * fully selected or not, so antialiased brush edges never leak a partial edit.
 */
export function hardenMaskPixels(data: Uint8ClampedArray) {
  for (let index = 0; index < data.length; index += 4) {
    const value = data[index] >= 128 ? 255 : 0;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return data;
}
