import type { CSSProperties, SyntheticEvent } from "react";

/** Used until a clip reports its own dimensions, so an empty stage is the same box as a 16:9 result. */
export const DEFAULT_VIDEO_STAGE_ASPECT = { width: 16, height: 9 };

export type VideoStageAspect = { width: number; height: number };

function usable(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Feeds one stage box its aspect ratio. Every video tool shares the same
 * geometry (`.videoStage`), and the clip's own dimensions drive the box, so
 * playback is native, the window does not change size between FLUX 3, Edit and
 * Upscale, and it does not jump between the empty, source and result states.
 */
export function videoStageStyle(aspect?: Partial<VideoStageAspect> | null): CSSProperties {
  if (!aspect || !usable(aspect.width) || !usable(aspect.height)) return {};
  return {
    "--video-stage-aspect-w": String(aspect.width),
    "--video-stage-aspect-h": String(aspect.height)
  } as CSSProperties;
}

/** Reads the intrinsic size of a clip once its metadata loads; null when the browser reports none. */
export function videoAspectFromEvent(event: SyntheticEvent<HTMLVideoElement>): VideoStageAspect | null {
  const video = event.currentTarget;
  return usable(video.videoWidth) && usable(video.videoHeight)
    ? { width: video.videoWidth, height: video.videoHeight }
    : null;
}
