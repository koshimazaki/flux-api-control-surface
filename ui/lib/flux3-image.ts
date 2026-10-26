import {
  FLUX3_IMAGE_ASPECT_RATIOS, FLUX3_IMAGE_KLEIN_MODEL, FLUX3_IMAGE_KLEIN_RESOLUTIONS,
  flux3ImageKleinSchema, kleinSettingsBlocker, kleinSettingsPayload
} from "@/lib/flux3-image-klein";
export { FLUX3_IMAGE_ASPECT_RATIOS, FLUX3_IMAGE_KLEIN_MODEL, FLUX3_IMAGE_KLEIN_RESOLUTIONS };
import { clampValue, type Size } from "@/lib/canvas-geometry";
import {
  FLUX3_IMAGE_MIN_BOX,
  boxesBlocker,
  composeEditPrompt,
  composeLayoutPrompt,
  editImages,
  type Flux3ImageRegion,
  type Flux3ImageRequestRegion
} from "@/lib/flux3-image-boxes";

export { FLUX3_IMAGE_MIN_BOX };
export type { Flux3Box, Flux3BoxAction, Flux3ImageRegion, Flux3ImageRequestRegion } from "@/lib/flux3-image-boxes";

/**
 * FLUX 3 Image on `POST /v1/flux-3-image` (published 1 October 2026): a
 * prompt, one to ten `images`, `aspect_ratio`, `resolution`, `grounding`,
 * `width`, `height`, `safety_tolerance` and `version`. Four ways in:
 *
 * - t2i: text to image, optionally laid out with boxes (layout rows)
 * - i2i: image to image from up to ten references named "image 1", "image 2"…
 * - edit: a whole-image edit of one source, from an instruction
 * - precise: an edit with boxes, each changing, keeping, moving or removing
 *   what is there (edit rows; see `flux3-image-boxes.ts`)
 *
 * There is no mask: boxes in the prompt place each change.
 */
export type Flux3ImageMode = "t2i" | "i2i" | "edit" | "precise";

/** Queue operation name for `POST /v1/flux-3-image`, alongside the FLUX.2 "generate" operation. */
export const FLUX3_IMAGE_OPERATION = "flux3-image";
/** The model label the queue shows and budgets by; BFL: 4k "can take several minutes". */
export const FLUX3_IMAGE_MODEL = "flux-3-image";
export const FLUX3_IMAGE_MODELS = [FLUX3_IMAGE_MODEL, FLUX3_IMAGE_KLEIN_MODEL] as const;
export const FLUX3_IMAGE_MODEL_LABELS = {
  [FLUX3_IMAGE_MODEL]: "FLUX 3 Image",
  [FLUX3_IMAGE_KLEIN_MODEL]: "FLUX 3 Image Klein"
};

/** `images`: "one to 10 total", references or the edit source alike. */
export const FLUX3_IMAGE_MAX_REFERENCES = 10;

/** Published resolution tiers; only some have a listed price. */
export const FLUX3_IMAGE_RESOLUTIONS = ["768sq", "1k", "1.5k", "2k", "4k", "match_input"] as const;
/** Price per image by resolution, from BFL's pricing page (1 October 2026). */
export const FLUX3_IMAGE_PRICE_USD: Partial<Record<(typeof FLUX3_IMAGE_RESOLUTIONS)[number], number>> = {
  "768sq": 0.041,
  "1k": 0.048,
  "2k": 0.1,
  "4k": 0.607
};
export type Flux3ImageAspectRatio = (typeof FLUX3_IMAGE_ASPECT_RATIOS)[number];
export type Flux3ImageResolution = (typeof FLUX3_IMAGE_RESOLUTIONS)[number];
export type Flux3ImageModel = typeof FLUX3_IMAGE_MODEL | typeof FLUX3_IMAGE_KLEIN_MODEL;

/** The published settings, with the API's own defaults. */
export type Flux3ImageSettings = {
  aspectRatio: Flux3ImageAspectRatio;
  resolution: Flux3ImageResolution | null;
  /** Omitted model keeps existing standard-model drafts working. */
  model?: Flux3ImageModel;
  outputFormat?: "jpeg" | "png";
  seed?: number | null;
  steps?: number | null;
  version?: "latest";
  width?: number | null;
  height?: number | null;
  /** Lets the prompt be grounded in web and image search; on by default. */
  grounding?: boolean;
  /** Moderation tolerance, 0 (strictest) to 7; organization approval applies. */
  safetyTolerance: number;
};

export const defaultFlux3ImageSettings: Flux3ImageSettings = {
  model: FLUX3_IMAGE_MODEL,
  aspectRatio: "auto",
  resolution: "1k",
  grounding: true,
  safetyTolerance: 2
};

export function normalizeFlux3ImageSettings(value: unknown): Flux3ImageSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (record.model === FLUX3_IMAGE_KLEIN_MODEL) {
    // Stored drafts and model switches can carry standard-only grounding, version
    // or match_input. Drop them on restore; explicit API requests still reject them.
    const restored = Object.fromEntries(Object.entries(record).filter(([key, entry]) =>
      key !== "grounding" && key !== "version" && !(key === "resolution" && entry === "match_input")));
    const checked = flux3ImageKleinSchema.safeParse({ prompt: "", ...kleinSettingsPayload(restored) });
    const parsed = checked.success ? checked.data : flux3ImageKleinSchema.parse({ prompt: "" });
    return {
      model: FLUX3_IMAGE_KLEIN_MODEL,
      aspectRatio: parsed.aspect_ratio,
      resolution: parsed.resolution ?? null,
      safetyTolerance: parsed.safety_tolerance,
      outputFormat: parsed.output_format,
      ...Object.fromEntries(["width", "height", "seed", "steps"].filter((key) => key in parsed)
        .map((key) => [key, parsed[key as keyof typeof parsed]]))
    };
  }
  const aspectRatio = FLUX3_IMAGE_ASPECT_RATIOS.find((ratio) => ratio === record.aspectRatio);
  const resolution = FLUX3_IMAGE_RESOLUTIONS.find((tier) => tier === record.resolution);
  const tolerance = Number(record.safetyTolerance);
  return {
    model: FLUX3_IMAGE_MODEL,
    aspectRatio: aspectRatio ?? defaultFlux3ImageSettings.aspectRatio,
    resolution: resolution ?? defaultFlux3ImageSettings.resolution,
    grounding: typeof record.grounding === "boolean" ? record.grounding : defaultFlux3ImageSettings.grounding,
    safetyTolerance: Number.isFinite(tolerance)
      ? Math.round(clampValue(tolerance, 0, 7))
      : defaultFlux3ImageSettings.safetyTolerance,
    ...Object.fromEntries(["width", "height", "version"].filter((key) => key in record).map((key) => [key, record[key]]))
  };
}

/**
 * Names a setting an outside request (an agent, MCP or the CLI) asked for that
 * this surface does not send. Saved drafts are normalized quietly; a request
 * is refused instead, so a caller never pays for a size or shape it did not
 * ask for. Unpriced tiers and exact sizes have no local cost estimate.
 */
export function flux3ImageSettingsBlocker(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (record.model !== undefined && record.model !== FLUX3_IMAGE_MODEL && record.model !== FLUX3_IMAGE_KLEIN_MODEL) {
    return `Unknown FLUX 3 Image model: ${JSON.stringify(record.model)}. Use flux-3-image or flux-3-image-klein.`;
  }
  if (record.model === FLUX3_IMAGE_KLEIN_MODEL) return kleinSettingsBlocker(value);
  const { resolution, aspectRatio, width, height } = record;
  if (record.safetyTolerance !== undefined && (!Number.isInteger(record.safetyTolerance) || Number(record.safetyTolerance) < 0 || Number(record.safetyTolerance) > 7)) return "Safety tolerance must be an integer between 0 and 7 (organization approval applies).";
  if ((width != null) !== (height != null)) return "Set width and height together.";
  if (width != null && (!Number.isInteger(width) || Number(width) < 256 || Number(width) > 6256 || !Number.isInteger(height) || Number(height) < 256 || Number(height) > 6256)) {
    return "Width and height must be integers between 256 and 6256 pixels.";
  }
  if (width != null && Number(width) * Number(height) > 16822272) return "width × height must be at most 16822272 pixels.";
  if (record.version !== undefined && record.version !== "latest") return "FLUX 3 Image version must be latest.";
  const given = (setting: unknown) => setting !== undefined && setting !== null && setting !== "";
  if (given(resolution) && !FLUX3_IMAGE_RESOLUTIONS.some((tier) => tier === resolution)) {
    return `FLUX 3 Image resolution must be one of ${FLUX3_IMAGE_RESOLUTIONS.join(", ")}, not ${JSON.stringify(resolution)}.`;
  }
  if (given(aspectRatio) && !FLUX3_IMAGE_ASPECT_RATIOS.some((ratio) => ratio === aspectRatio)) {
    return `FLUX 3 Image aspectRatio must be one of ${FLUX3_IMAGE_ASPECT_RATIOS.join(", ")}, not ${JSON.stringify(aspectRatio)}.`;
  }
  return null;
}

export type Flux3ImageRequest = {
  mode: Flux3ImageMode;
  /** The prompt for text to image, image to image, or an edit. */
  prompt?: string;
  /** Image to image: reference images in slot order, referred to as image 1, image 2… */
  references?: string[];
  /** Source image for edit and precise modes (data URL or dashboard URL). */
  source?: string;
  /** Not in the API: an agent that sends one is told to use boxes instead. */
  mask?: string;
  /** Precise: the boxes, each with its action, description and optional reference. */
  regions?: Flux3ImageRequestRegion[];
  /** Text to image: layout boxes, each with what goes in it. */
  layout?: Flux3ImageRequestRegion[];
  /** The pixel size the boxes were drawn in: the source for precise, the layout frame for t2i. */
  frame?: Size;
  /** Published settings; missing ones take the API defaults. */
  settings?: Partial<Flux3ImageSettings>;
};

/** The published API: its endpoint, the request mapping and, once BFL lists a price, an estimate. */
export type Flux3ImageApi = {
  endpoint: string;
  toPayload: (request: Flux3ImageRequest) => Record<string, unknown>;
  estimateUsd?: (request: Flux3ImageRequest) => number | null;
};

/**
 * The images a request sends, in order: the references for image to image;
 * the source for an edit; the source then each distinct box reference for a
 * precise edit, so `ref_image_N` matches its position.
 */
export function flux3ImageInputs(request: Flux3ImageRequest) {
  if (request.mode === "i2i") return (request.references ?? []).filter(Boolean);
  if (request.mode === "edit") return request.source ? [request.source] : [];
  if (request.mode === "precise") return editImages(request.source, request.regions ?? []);
  return [];
}

/** Layout boxes with nothing in them are left out; an empty layout is plain text to image. */
function usedLayout(request: Flux3ImageRequest) {
  return request.mode === "t2i" ? (request.layout ?? []).filter((box) => box.prompt.trim()) : [];
}

function toPayload(request: Flux3ImageRequest): Record<string, unknown> {
  const settings = normalizeFlux3ImageSettings(request.settings);
  const images = flux3ImageInputs(request);
  const layout = usedLayout(request);
  let prompt = (request.prompt ?? "").trim();
  let aspectRatio: Flux3ImageAspectRatio = settings.aspectRatio;
  if (request.mode === "precise" && request.frame) {
    prompt = composeEditPrompt(request.prompt, request.regions ?? [], request.frame, images);
    // Boxes are drawn on the source frame; auto keeps it, so they land where they were drawn.
    aspectRatio = "auto";
  } else if (layout.length && request.frame) {
    prompt = composeLayoutPrompt(request.prompt, layout, request.frame);
    // The frame the boxes were designed on; without a reference, auto would be square anyway.
    if (aspectRatio === "auto") aspectRatio = "1:1";
  }
  if (settings.model === FLUX3_IMAGE_KLEIN_MODEL) {
    const payloadSettings = kleinSettingsPayload(settings);
    if (request.frame && (request.mode === "precise" || layout.length > 0)) {
      // Exact sizes override aspect_ratio at the provider, moving boxes off their designed frame.
      delete payloadSettings.width;
      delete payloadSettings.height;
    }
    return flux3ImageKleinSchema.parse({
      ...payloadSettings, prompt,
      ...(images.length ? { images } : {}), aspect_ratio: aspectRatio
    });
  }
  return {
    prompt,
    ...(images.length ? { images } : {}),
    aspect_ratio: aspectRatio,
    resolution: settings.resolution,
    grounding: settings.grounding,
    safety_tolerance: settings.safetyTolerance,
    ...(settings.width != null && settings.height != null ? { width: settings.width, height: settings.height } : {}),
    ...(settings.version ? { version: settings.version } : {})
  };
}

/** `POST /v1/flux-3-image`, published 1 October 2026, priced per image by resolution. */
export const FLUX3_IMAGE_API: Flux3ImageApi | null = {
  endpoint: "flux-3-image",
  toPayload,
  estimateUsd: (request) => {
    const settings = normalizeFlux3ImageSettings(request.settings);
    if (settings.width != null && settings.height != null) return null;
    const resolution = settings.resolution;
    return resolution && resolution in FLUX3_IMAGE_PRICE_USD
      ? FLUX3_IMAGE_PRICE_USD[resolution as keyof typeof FLUX3_IMAGE_PRICE_USD] ?? null : null;
  }
};

const FLUX3_IMAGE_KLEIN_API: Flux3ImageApi = {
  endpoint: FLUX3_IMAGE_KLEIN_MODEL,
  toPayload,
  estimateUsd: () => null
};

export function flux3ImageModel(input: Flux3ImageRequest) {
  return input.settings?.model === FLUX3_IMAGE_KLEIN_MODEL ? FLUX3_IMAGE_KLEIN_MODEL : FLUX3_IMAGE_MODEL;
}

function apiFor(input: Flux3ImageRequest) {
  return flux3ImageModel(input) === FLUX3_IMAGE_KLEIN_MODEL ? FLUX3_IMAGE_KLEIN_API : FLUX3_IMAGE_API;
}

export const FLUX3_IMAGE_API_PENDING =
  "FLUX 3 Image is not in the API yet. This request is ready to wire once the endpoint is published.";

/** What the published API cannot take at all: a mask. Boxes in Precise do that job. */
export function flux3ImageScopeBlocker(input: Flux3ImageRequest) {
  if (input.mask) return "FLUX 3 Image takes no mask. Use Precise and draw a box around the area instead.";
  return null;
}

export function flux3ImageInputBlocker(input: Flux3ImageRequest) {
  if (input.mode === "t2i") {
    const layout = input.layout ?? [];
    if (!input.prompt?.trim() && !layout.some((box) => box.prompt.trim())) return "Describe the image you want.";
    return layout.length ? boxesBlocker(usedLayout(input), input.frame, true) : null;
  }
  if (input.mode === "i2i") {
    const count = input.references?.filter(Boolean).length ?? 0;
    if (!count) return "Add at least one reference image.";
    if (count > FLUX3_IMAGE_MAX_REFERENCES) return `FLUX 3 Image takes up to ${FLUX3_IMAGE_MAX_REFERENCES} references here.`;
    return input.prompt?.trim() ? null : "Describe the image to make from the references.";
  }
  if (!input.source) return "Load a source image to edit.";
  if (input.mode === "edit") return input.prompt?.trim() ? null : "Describe the edit.";
  const images = flux3ImageInputs(input);
  if (images.length > FLUX3_IMAGE_MAX_REFERENCES) {
    return `The source and box references come to ${images.length} images; FLUX 3 Image takes up to ${FLUX3_IMAGE_MAX_REFERENCES}.`;
  }
  return boxesBlocker(input.regions ?? [], input.frame);
}

/** The input problem first, then what the API cannot take yet; null only when a request could be sent. */
export function flux3ImageRequestBlocker(input: Flux3ImageRequest, api: Flux3ImageApi | null = apiFor(input)) {
  const settings = input.settings;
  if (settings?.model !== FLUX3_IMAGE_KLEIN_MODEL) {
    const images = flux3ImageInputs(input);
    if (settings?.resolution === "match_input" && settings.width == null && !images.length) return "match_input requires a reference image.";
    if (images.length && settings?.width != null && settings.height != null && settings.width * settings.height > 4194304) return "Exact output with reference images must be at most 4194304 pixels.";
    if (settings?.width != null && settings.height != null && input.frame && (input.mode === "precise" || usedLayout(input).length > 0) && settings.width * input.frame.height !== settings.height * input.frame.width) return "Exact width and height must preserve the box frame aspect ratio.";
  }
  return flux3ImageSettingsBlocker(input.settings) ?? flux3ImageInputBlocker(input) ?? (api ? flux3ImageScopeBlocker(input) : FLUX3_IMAGE_API_PENDING);
}

export function estimateFlux3ImageUsd(input: Flux3ImageRequest, api: Flux3ImageApi | null = apiFor(input)) {
  return api?.estimateUsd?.(input) ?? null;
}

export function buildFlux3ImagePayload(input: Flux3ImageRequest, api: Flux3ImageApi | null = apiFor(input)) {
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
  return compactReferenceIds(next);
}

/**
 * Reference slots without gaps, filled ones first in order. The request sends
 * only filled slots, so this keeps "image N" on screen the Nth image sent.
 */
export function compactReferenceIds(slots: (string | null)[]) {
  const filled = slots.filter((id): id is string => Boolean(id));
  return [...filled, ...Array.from({ length: Math.max(0, slots.length - filled.length) }, () => null)];
}

/** "image 3", "Image #3": how prompts name references. */
const IMAGE_MENTION = /\b(image\s*#?\s*)(\d+)\b/gi;

/**
 * Removes reference `index` and moves the later ones up one. Mentions of the
 * moved images in the prompt are renumbered to match, unless the prompt names
 * the removed image: then nothing is renamed, since its number now belongs to
 * the next image, and `namesRemoved` asks the caller to have the user check.
 */
export function removeReference(slots: (string | null)[], index: number, prompt: string) {
  const references = compactReferenceIds(slots.map((id, slot) => (slot === index ? null : id)));
  const moved = slots.slice(index + 1).filter(Boolean).length;
  const removed = index + 1;
  const numbers = [...prompt.matchAll(IMAGE_MENTION)].map((match) => Number(match[2]));
  const namesRemoved = moved > 0 && numbers.includes(removed);
  const renumber = moved > 0 && !namesRemoved && numbers.some((number) => number > removed && number <= removed + moved);
  return {
    references,
    moved,
    namesRemoved,
    prompt: renumber
      ? prompt.replace(IMAGE_MENTION, (match, label: string, digits: string) => {
          const number = Number(digits);
          return number > removed && number <= removed + moved ? `${label}${number - 1}` : match;
        })
      : prompt,
    renumbered: renumber
  };
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
