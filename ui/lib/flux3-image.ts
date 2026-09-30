import { clampValue, type Size } from "@/lib/canvas-geometry";

/**
 * FLUX 3 Image: text to image, whole-image edits, and precise edits limited to
 * boxes or painted pixels. The model's API is not published yet, so this module
 * holds only the client-side request shape, the blocker and the region
 * geometry. `FLUX3_IMAGE_API` stays null until BFL publishes the endpoint and
 * schema; nothing can be submitted before then, and no payload is guessed.
 */
export type Flux3ImageMode = "t2i" | "edit" | "precise";
/** Precise edits limit the change to bounding boxes or to painted pixels. */
export type Flux3ImageSelection = "boxes" | "pixels";

/** A bounding box in source-image pixels, with the edit typed into it. */
export type Flux3ImageBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Soft-edge radius in source pixels, for edges such as hair. */
  fuzz: number;
  prompt: string;
};

/** Provisional UI limits until the API documents its own. */
export const FLUX3_IMAGE_FUZZ_MAX = 64;
export const FLUX3_IMAGE_DEFAULT_FUZZ = 8;
export const FLUX3_IMAGE_MIN_BOX = 8;

export type Flux3ImageRequest = {
  mode: Flux3ImageMode;
  /** The prompt for text to image, a whole-image edit, or a pixel selection. */
  prompt?: string;
  /** Source image for edit and precise modes (data URL or dashboard URL). */
  source?: string;
  selection?: Flux3ImageSelection;
  boxes?: Flux3ImageBox[];
  /** White-on-black PNG at the source resolution, every pixel fully in or out. */
  mask?: string;
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
  if (!input.source) return "Load a source image to edit.";
  if (input.mode === "edit") return input.prompt?.trim() ? null : "Describe the edit.";
  if (input.selection === "pixels") {
    if (!input.mask) return "Paint the pixels to change.";
    return input.prompt?.trim() ? null : "Describe the edit for the painted pixels.";
  }
  const boxes = input.boxes ?? [];
  if (!boxes.length) return "Draw a box around the area to change.";
  const empty = boxes.findIndex((box) => !box.prompt.trim());
  return empty === -1 ? null : `Type the edit into box ${empty + 1}.`;
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
