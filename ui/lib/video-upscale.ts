export const VIDEO_UPSCALE_OPERATION = "video-upscale" as const;
export const VIDEO_UPSCALE_ENDPOINT = "flux-tools/video-upscale-v1" as const;
export const VIDEO_UPSCALE_MODEL = "flux-tools-video-upscale-v1" as const;
export const VIDEO_UPSCALE_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_UPSCALE_MAX_SECONDS = 20;
export const VIDEO_UPSCALE_MAX_OUTPUT_MP = 13.75;
export const VIDEO_UPSCALE_MAX_INPUT_PIXELS = 2560 * 1440;

export type VideoUpscaleCreativity = 0 | 1;

export type VideoUpscaleRequest = {
  inputVideo: string;
  upscaleFactor?: number;
  creativity?: VideoUpscaleCreativity;
  prompt?: string;
  safetyTolerance?: number;
  title?: string;
  sourceAssetId?: string;
  sourceName?: string;
  sourceBytes?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
};

export type VideoUpscaleResult = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  sourceVideoUrl: string;
  videoUrl: string;
  upscaleFactor: number;
  creativity: VideoUpscaleCreativity;
  safetyTolerance: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
  outputWidth?: number;
  outputHeight?: number;
  estimatedUsd?: number | null;
  costCredits?: number | null;
  creditsAfter?: number | null;
  sourceAssetId?: string | null;
  outputFiles?: Record<string, unknown>;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampUpscaleFactor(value: number) {
  return Math.round(Math.min(3, Math.max(1.5, value)) * 10) / 10;
}

export function videoUpscaleRequestBlocker(request: VideoUpscaleRequest) {
  if (!request.inputVideo?.trim()) return "Add an MP4 clip to upscale.";
  if (finite(request.sourceBytes) && request.sourceBytes > VIDEO_UPSCALE_MAX_BYTES) {
    return "Video Upscale accepts MP4 files up to 50 MB.";
  }
  // FLUX 3's own "20 second" renders report container durations slightly over
  // 20 (audio padding, metadata rounding). Keep our existing <20.5s allowance;
  // the provider upscales the first 20 seconds, rejecting clips well over it.
  if (finite(request.durationSeconds) && Math.round(request.durationSeconds) > VIDEO_UPSCALE_MAX_SECONDS) {
    return `Video Upscale accepts clips up to 20 seconds; this clip reports ${request.durationSeconds.toFixed(1)} s.`;
  }
  const factor = request.upscaleFactor ?? 2;
  if (!finite(factor) || factor < 1.5 || factor > 3) return "Upscale factor must be between 1.5× and 3×.";
  if (![0, 1].includes(request.creativity ?? 1)) return "Creativity must be Precise (0) or Creative (1).";
  const safety = request.safetyTolerance ?? 2;
  if (!Number.isInteger(safety) || safety < 0 || safety > 7) return "Safety tolerance must be between 0 and 7.";
  if (finite(request.sourceWidth) && finite(request.sourceHeight)) {
    if (!Number.isInteger(request.sourceWidth) || !Number.isInteger(request.sourceHeight) || request.sourceWidth <= 0 || request.sourceHeight <= 0) return "Source dimensions must be positive integers.";
    if (request.sourceWidth * request.sourceHeight > VIDEO_UPSCALE_MAX_INPUT_PIXELS) return "Video Upscale input must be at most 2560 × 1440 pixels (3.7 MP). Downscale the source first.";
  }
  return null;
}

export function buildVideoUpscalePayload(request: VideoUpscaleRequest) {
  const blocker = videoUpscaleRequestBlocker(request);
  if (blocker) throw new Error(blocker);
  return {
    input_video: request.inputVideo,
    upscale_factor: request.upscaleFactor ?? 2,
    creativity: request.creativity ?? 1,
    ...(request.prompt?.trim() ? { prompt: request.prompt.trim() } : {}),
    safety_tolerance: request.safetyTolerance ?? 2
  };
}

/** Expected capped frame; the provider may round output dimensions. */
export function videoUpscaleOutputSize(request: VideoUpscaleRequest) {
  if (!finite(request.sourceWidth) || !finite(request.sourceHeight) || request.sourceWidth <= 0 || request.sourceHeight <= 0) return null;
  const factor = Math.min(request.upscaleFactor ?? 2, Math.sqrt(VIDEO_UPSCALE_MAX_OUTPUT_MP * 1_000_000 / (request.sourceWidth * request.sourceHeight)));
  return { width: Math.floor(request.sourceWidth * factor), height: Math.floor(request.sourceHeight * factor) };
}

export function estimateVideoUpscaleUsd(request: VideoUpscaleRequest) {
  if (!finite(request.sourceWidth) || !finite(request.sourceHeight) || !finite(request.durationSeconds)) return null;
  const factor = request.upscaleFactor ?? 2;
  const outputMp = Math.min(VIDEO_UPSCALE_MAX_OUTPUT_MP, (request.sourceWidth * factor * request.sourceHeight * factor) / 1_000_000);
  const rate = (request.creativity ?? 1) === 0 ? 0.07 : 0.1;
  return Math.round(outputMp * Math.min(VIDEO_UPSCALE_MAX_SECONDS, request.durationSeconds) * rate * 100) / 100;
}

export function redactVideoUpscalePayload(payload: Record<string, unknown>) {
  return { ...payload, input_video: "[video input omitted]" };
}

/** A video handed to the upscale workspace from another surface (library card, FLUX 3 result). */
export type VideoUpscaleSourceInput = {
  assetId?: string;
  name: string;
  url: string;
};
