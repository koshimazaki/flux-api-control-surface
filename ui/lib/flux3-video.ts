export type Flux3VideoMode = "t2v" | "i2v" | "v2v" | "draft_enhance";
export type Flux3VideoResolution = "hd" | "fhd";
export type Flux3VideoAspectRatio = "auto" | "21:9" | "2:1" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";

export type Flux3InputMedia = {
  id: string;
  name: string;
  kind: "image" | "video";
  source: string;
  assetId?: string;
};

export function flux3MediaFromAsset(asset: {
  id: string;
  title?: string;
  mediaType?: string;
  videoUrl?: string;
  imageDataUrl?: string;
  sampleUrl?: string;
  imageUrl?: string;
  image_url?: string;
}): Flux3InputMedia | null {
  const source = asset.videoUrl || asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url || "";
  if (!source) return null;
  return {
    // Per-instance id: the same asset can appear as several keyframes (an
    // A-B-A loop is legitimate), so the entry id must not collide while
    // `assetId` keeps the stable link for badges and provenance.
    id: `asset-${asset.id}-${Math.random().toString(36).slice(2, 8)}`,
    name: asset.title || asset.id,
    kind: asset.mediaType === "video" ? "video" : "image",
    source,
    assetId: asset.id
  };
}

/**
 * An explicitly timed keyframe: `[seconds, image]`. FLUX.3 accepts either a
 * plain image array (evenly distributed) or these pairs on the same
 * `keyframes` field, so the request type keeps them apart and
 * `buildFlux3VideoPayload` serializes whichever one is present.
 */
export type Flux3TimedKeyframe = [seconds: number, image: string];

/** Absolute ceiling for a timestamp, matching the i2v/t2v duration maximum. */
export const FLUX3_MAX_TIMED_SECONDS = 20;

export type Flux3VideoRequest = {
  mode: Flux3VideoMode;
  prompt?: string;
  keyframes?: string[];
  /**
   * Additive alternative to `keyframes` for timed rows. Every existing caller
   * that sends `keyframes` is unaffected; when both are present the timed pairs
   * win because they carry strictly more information.
   */
  timedKeyframes?: Flux3TimedKeyframe[];
  startVideo?: string;
  draftCache?: string;
  draftCacheId?: string;
  aspectRatio?: Flux3VideoAspectRatio;
  duration?: number | "auto";
  resolution?: Flux3VideoResolution;
  generateAudio?: boolean;
  safetyTolerance?: number;
  draft?: boolean;
};

export type Flux3VideoResult = {
  id: string;
  title: string;
  prompt: string;
  mode: Flux3VideoMode;
  videoUrl: string;
  createdAt: string;
  draft: boolean;
  draftCacheAvailable: boolean;
  resolution?: Flux3VideoResolution;
  duration?: number | "auto";
  aspectRatio?: Flux3VideoAspectRatio;
  generateAudio?: boolean;
  costCredits?: number | null;
  creditsAfter?: number | null;
  outputFiles?: Record<string, unknown>;
};

export const FLUX3_ASPECT_RATIOS: Flux3VideoAspectRatio[] = [
  "auto",
  "21:9",
  "2:1",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16"
];

export function flux3MaxDuration(mode: Flux3VideoMode) {
  return mode === "v2v" ? 15 : 20;
}

/** The `[seconds, image]` pairs of a request, ignoring malformed entries. */
export function flux3TimedKeyframes(input: Pick<Flux3VideoRequest, "timedKeyframes">): Flux3TimedKeyframe[] {
  if (!Array.isArray(input.timedKeyframes)) return [];
  return input.timedKeyframes.filter(
    (pair): pair is Flux3TimedKeyframe => Array.isArray(pair) && pair.length === 2 && Boolean(pair[1])
  );
}

/** Keyframe count from whichever timeline shape the request carries. */
export function flux3KeyframeCount(input: Pick<Flux3VideoRequest, "keyframes" | "timedKeyframes">) {
  const timed = flux3TimedKeyframes(input);
  return timed.length || input.keyframes?.filter(Boolean).length || 0;
}

/**
 * Timestamp rules for explicitly timed keyframes: one non-negative number per
 * image, strictly increasing, inside the requested duration, and never past the
 * API's twenty-second ceiling.
 */
export function flux3TimedKeyframeBlocker(pairs: Flux3TimedKeyframe[], duration: number | "auto" | undefined) {
  if (!pairs.length) return null;
  if (typeof duration !== "number") return "Timed keyframes need a fixed duration so timestamps can be checked.";
  if (pairs.some(([seconds]) => typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0)) {
    return "Keyframe timestamps must be non-negative numbers of seconds.";
  }
  if (pairs.some(([seconds], index) => index > 0 && seconds <= pairs[index - 1][0])) {
    return "Keyframe timestamps must strictly increase.";
  }
  const last = pairs[pairs.length - 1][0];
  if (last > duration) return `Keyframe timestamps must stay within the ${duration}s duration.`;
  if (last > FLUX3_MAX_TIMED_SECONDS) {
    return `Keyframe timestamps must stay within ${FLUX3_MAX_TIMED_SECONDS} seconds.`;
  }
  return null;
}

export function flux3RequestBlocker(input: Flux3VideoRequest) {
  if (input.mode === "draft_enhance") {
    return input.draftCache || input.draftCacheId ? null : "Choose a saved draft to enhance.";
  }

  if (!input.prompt?.trim()) return "Describe the video you want FLUX.3 to generate.";
  if (input.mode === "i2v") {
    const timed = flux3TimedKeyframes(input);
    const count = flux3KeyframeCount(input);
    if (count < 1) return "Add at least one image keyframe.";
    if (count > 10) return "FLUX.3 accepts up to ten image keyframes.";
    if (timed.length) {
      const timingBlocker = flux3TimedKeyframeBlocker(timed, input.duration);
      if (timingBlocker) return timingBlocker;
    } else if (count > 2 && (input.duration === undefined || input.duration === "auto")) {
      return "Set a duration when using three or more image keyframes.";
    }
  }
  if (input.mode === "v2v" && !input.startVideo) return "Drop an MP4 clip to continue.";

  if (typeof input.duration === "number") {
    if (!Number.isInteger(input.duration) || input.duration < 5 || input.duration > flux3MaxDuration(input.mode)) {
      return `Duration must be a whole number from 5 to ${flux3MaxDuration(input.mode)} seconds.`;
    }
  }

  const maxSafety = input.mode === "t2v" ? 4 : 2;
  if (
    typeof input.safetyTolerance === "number" &&
    (!Number.isInteger(input.safetyTolerance) || input.safetyTolerance < 0 || input.safetyTolerance > maxSafety)
  ) {
    return `Safety tolerance must be between 0 and ${maxSafety} for this mode.`;
  }
  return null;
}

export function buildFlux3VideoPayload(input: Flux3VideoRequest) {
  const blocker = flux3RequestBlocker(input);
  if (blocker) throw new Error(blocker);

  if (input.mode === "draft_enhance") {
    return {
      mode: input.mode,
      draft_cache: input.draftCache,
      resolution: input.resolution || "fhd",
      safety_tolerance: input.safetyTolerance ?? 2
    };
  }

  const payload: Record<string, unknown> = {
    mode: input.mode,
    prompt: input.prompt!.trim(),
    aspect_ratio: input.aspectRatio || "auto",
    duration: input.duration ?? "auto",
    resolution: input.resolution || "hd",
    generate_audio: input.generateAudio !== false,
    safety_tolerance: input.safetyTolerance ?? 2,
    draft: Boolean(input.draft)
  };
  if (input.mode === "i2v") {
    // Timed rows serialize to `[seconds, image]` pairs; even rows serialize to a
    // plain image array. Both ride the same upstream `keyframes` field.
    const timed = flux3TimedKeyframes(input);
    payload.keyframes = timed.length ? timed : input.keyframes;
  }
  if (input.mode === "v2v") payload.start_video = input.startVideo;
  return payload;
}

export function estimateFlux3VideoUsd(input: Flux3VideoRequest) {
  if (input.mode === "draft_enhance" || typeof input.duration !== "number") return null;
  if (input.mode === "v2v") {
    return input.duration * (input.draft ? 0.12 : input.resolution === "fhd" ? 0.54 : 0.43);
  }
  return input.duration * (input.draft ? 0.06 : input.resolution === "fhd" ? 0.29 : 0.17);
}

export function redactFlux3Payload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (key === "keyframes") {
        const count = Array.isArray(value) ? value.length : value ? 1 : 0;
        return [key, `[${count} image keyframe${count === 1 ? "" : "s"} omitted]`];
      }
      if (key === "start_video") return [key, "[video input omitted]"];
      if (key === "draft_cache") return [key, "[draft cache omitted]"];
      return [key, value];
    })
  );
}
