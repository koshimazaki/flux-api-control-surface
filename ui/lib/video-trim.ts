import { VIDEO_EDIT_MAX_SECONDS, VIDEO_EDIT_MIN_SECONDS } from "@/lib/video-edit";

export const VIDEO_TRIM_OPERATION = "video-trim" as const;
export const VIDEO_TRIM_MODEL = "local-video-trim" as const;
/** The bracket can never exceed what Video Edit accepts; that is the whole point of the tool. */
export const VIDEO_TRIM_MAX_SECONDS = VIDEO_EDIT_MAX_SECONDS;
export const VIDEO_TRIM_MIN_SECONDS = VIDEO_EDIT_MIN_SECONDS;
/**
 * BFL normalizes every edited clip to 24 fps and needs at least 17 frames, so
 * the bracket works on that grid whatever the source reports. Both edges snap
 * to a frame boundary, which is also the smallest step the handles can take.
 */
export const VIDEO_TRIM_FPS = 24;
export const VIDEO_TRIM_MIN_FRAMES = 17;
export const VIDEO_TRIM_FRAME_SECONDS = 1 / VIDEO_TRIM_FPS;

/** Snaps a time to the nearest frame boundary. */
export function snapToFrame(seconds: number, fps = VIDEO_TRIM_FPS) {
  if (!Number.isFinite(seconds) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round(seconds * fps) / fps;
}

/** Whole frames in a span, on the same 24 fps grid the API uses. */
export function framesIn(seconds: number, fps = VIDEO_TRIM_FPS) {
  return Number.isFinite(seconds) ? Math.max(0, Math.round(seconds * fps)) : 0;
}

export type TrimSelection = { start: number; end: number };

export type VideoTrimRequest = {
  inputVideo: string;
  start: number;
  end: number;
  title?: string;
  sourceAssetId?: string;
  sourceName?: string;
};

export type VideoTrimResult = {
  id: string;
  title: string;
  createdAt: string;
  videoUrl: string;
  start: number;
  end: number;
  durationSeconds: number;
  sourceName?: string;
  sourceAssetId?: string | null;
  sourceDurationSeconds?: number;
  outputFiles?: Record<string, unknown>;
};

function round(value: number) {
  // Not milliseconds: the 17-frame minimum is 17/24 s, which no whole number of
  // milliseconds represents, so rounding there would drop the bracket below the
  // minimum the API accepts. Six decimals keeps every frame boundary exact.
  return Math.round(value * 1e6) / 1e6;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** True when a clip is longer than Video Edit accepts and therefore has to be cut first. */
export function needsTrimForEdit(durationSeconds?: number) {
  return finite(durationSeconds) && Math.round(durationSeconds) > VIDEO_TRIM_MAX_SECONDS;
}

/** Opens the bracket at the start of the clip, filling it up to the 15-second maximum. */
export function defaultTrimSelection(duration: number): TrimSelection {
  return clampTrimSelection({ start: 0, end: Math.min(duration, VIDEO_TRIM_MAX_SECONDS) }, duration);
}

/**
 * Keeps a bracket legal for Video Edit: on the frame grid, inside the clip, at
 * least 17 frames long, and never longer than 15 seconds. A shorter cut is
 * fine — 15 is the ceiling, not the length. Resizing moves one edge; the
 * opposite edge stays put.
 */
export function clampTrimSelection(selection: TrimSelection, duration: number): TrimSelection {
  if (!finite(duration) || duration <= 0) return { start: 0, end: 0 };
  const maxLength = Math.min(VIDEO_TRIM_MAX_SECONDS, duration);
  const minLength = Math.min(VIDEO_TRIM_MIN_FRAMES * VIDEO_TRIM_FRAME_SECONDS, duration);

  let start = finite(selection.start) ? Math.max(0, Math.min(snapToFrame(selection.start), duration)) : 0;
  let end = finite(selection.end) ? Math.max(0, Math.min(snapToFrame(selection.end), duration)) : maxLength;
  if (end < start) [start, end] = [end, start];

  let length = end - start;
  if (length > maxLength) end = start + maxLength;
  if (length < minLength) end = start + minLength;
  if (end > duration) {
    end = duration;
    start = Math.max(0, end - Math.max(minLength, Math.min(length || minLength, maxLength)));
  }
  length = end - start;
  if (length > maxLength) start = end - maxLength;

  return { start: round(Math.max(0, start)), end: round(Math.min(duration, end)) };
}

/** Slides the whole bracket without changing its length. */
export function moveTrimSelection(selection: TrimSelection, nextStart: number, duration: number): TrimSelection {
  const length = Math.max(0, selection.end - selection.start);
  const start = Math.max(0, Math.min(nextStart, Math.max(0, duration - length)));
  return clampTrimSelection({ start, end: start + length }, duration);
}

export function trimSelectionBlocker(selection: TrimSelection, duration?: number) {
  if (!finite(duration) || duration <= 0) return "Load a clip before choosing a cut.";
  const frames = framesIn(selection.end - selection.start);
  if (frames < VIDEO_TRIM_MIN_FRAMES) return `A cut needs at least ${VIDEO_TRIM_MIN_FRAMES} frames (about 0.7 seconds).`;
  if (frames > framesIn(VIDEO_TRIM_MAX_SECONDS)) return "A cut can be at most 15 seconds.";
  return null;
}

/** Second marks for the ruler, plus how far the bracket may still reach from its start. */
export function trimRulerSeconds(duration: number, step = 1) {
  if (!finite(duration) || duration <= 0 || step <= 0) return [];
  return Array.from({ length: Math.floor(duration / step) + 1 }, (_, index) => index * step).filter(
    (second) => second > 0 && second < duration
  );
}

/** `0:07+11` — seconds and the frame within them, so a cut can be read exactly. */
export function formatTimecode(seconds: number, fps = VIDEO_TRIM_FPS) {
  if (!finite(seconds) || seconds < 0) return `0:00+00`;
  const totalFrames = framesIn(seconds, fps);
  const whole = Math.floor(totalFrames / fps);
  const frame = totalFrames % fps;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}+${String(frame).padStart(2, "0")}`;
}

/**
 * Seeks before the input so ffmpeg decodes from the nearest keyframe, then
 * re-encodes: a stream copy would snap the cut to a keyframe and lose the
 * frames the bracket actually selected. Audio is carried when the clip has any.
 */
export function buildTrimArgs(options: { inputPath: string; outputPath: string; start: number; duration: number }) {
  return [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-ss", options.start.toFixed(3),
    "-i", options.inputPath,
    "-t", options.duration.toFixed(3),
    "-map", "0:v:0",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    options.outputPath
  ];
}
