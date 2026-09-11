export const VIDEO_EDIT_OPERATION = "video-edit" as const;
export const VIDEO_EDIT_ENDPOINT = "flux-tools/video-edit-v1" as const;
export const VIDEO_EDIT_MODEL = "flux-tools-video-edit-v1" as const;
export const VIDEO_EDIT_MAX_BYTES = 50 * 1024 * 1024;
export const VIDEO_EDIT_MAX_SECONDS = 15;
/** BFL normalizes the clip to 24 fps and needs at least 17 frames after that. */
export const VIDEO_EDIT_MIN_SECONDS = 17 / 24;
export const VIDEO_EDIT_MIN_SIDE_PX = 160;
export const VIDEO_EDIT_PROMPT_MAX_CHARS = 4096;
/** Documented FLUX Video Edit [fast] price; the output keeps the source length. */
export const VIDEO_EDIT_USD_PER_SECOND = 0.03;

/**
 * The documented request is deliberately small: one clip plus one instruction.
 * There are no image references, masks, seeds, duration or resolution controls
 * — duration, aspect ratio and audio follow the source, and anything above
 * 720p comes back at 720p.
 */
export type VideoEditRequest = {
  inputVideo: string;
  prompt: string;
  safetyTolerance?: number;
  title?: string;
  sourceAssetId?: string;
  sourceName?: string;
  sourceBytes?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
};

export type VideoEditResult = {
  id: string;
  title: string;
  prompt: string;
  createdAt: string;
  sourceVideoUrl: string;
  videoUrl: string;
  safetyTolerance: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
  estimatedUsd?: number | null;
  costCredits?: number | null;
  creditsAfter?: number | null;
  sourceAssetId?: string | null;
  outputFiles?: Record<string, unknown>;
};

/** A clip handed to the edit workspace from another surface (library card, lightbox, FLUX 3 result). */
export type VideoEditSourceInput = {
  assetId?: string;
  name: string;
  url: string;
};

export type VideoEditPromptStarter = { label: string; prompt: string };

/**
 * Starters follow BFL's video-editing guidance: name the change, its placement
 * and appearance, and nothing else — everything unmentioned stays as filmed.
 * Bracketed parts are the blanks to fill in.
 */
export const VIDEO_EDIT_PROMPT_STARTERS: VideoEditPromptStarter[] = [
  { label: "Remove", prompt: "Remove the [object]." },
  { label: "Recolor", prompt: "Make the [object] [color]." },
  { label: "Add", prompt: "Add a [subject] [where in the frame], [what it is doing]." },
  { label: "Replace", prompt: "Replace the [object] with [new object]." },
  { label: "Sign", prompt: "Change the [sign or label] to read [TEXT]." },
  { label: "Dialogue", prompt: "Make [the speaker] say \"[a line no longer than the original speech]\"." },
  {
    label: "Restyle",
    prompt: "Restyle this clip as [material or medium]: describe the surfaces, seams, and reflections that replace the originals."
  },
  { label: "Relight", prompt: "Change the scene to [time of day or weather]. Keep the same camera move and blocking." }
];

/**
 * A starter behaves as a toggle rather than an insert: clicking one twice must
 * not leave two copies in the prompt. Different starters compound, so several
 * changes can be written out, and clicking an applied one takes it back off.
 */
export function toggleStarterInPrompt(prompt: string, starter: string) {
  const existing = prompt || "";
  if (existing.includes(starter)) {
    return existing.replace(starter, "").replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").trim();
  }
  const head = existing.trimEnd();
  return head ? `${head} ${starter}` : starter;
}

/** Which starters are currently written into the prompt, so the menu can show it. */
export function activeStarterLabels(prompt: string, starters: VideoEditPromptStarter[] = VIDEO_EDIT_PROMPT_STARTERS) {
  const text = prompt || "";
  return starters.filter((starter) => text.includes(starter.prompt)).map((starter) => starter.label);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function videoEditRequestBlocker(request: VideoEditRequest) {
  if (!request.inputVideo?.trim()) return "Add an MP4 clip to edit.";
  const prompt = request.prompt?.trim() || "";
  if (!prompt) return "Describe the change you want FLUX to make.";
  if (prompt.length > VIDEO_EDIT_PROMPT_MAX_CHARS) return "Edit instructions are limited to 4,096 characters.";
  if (finite(request.sourceBytes) && request.sourceBytes > VIDEO_EDIT_MAX_BYTES) {
    return "Video Edit accepts MP4 files up to 50 MB.";
  }
  if (finite(request.durationSeconds)) {
    // Container metadata for FLUX 3's own maximum-length clips reports slightly
    // over the whole second (audio padding, rounding). Compare on whole seconds
    // so a 15 s continuation is never rejected by its own editor.
    if (Math.round(request.durationSeconds) > VIDEO_EDIT_MAX_SECONDS) {
      return `Video Edit accepts clips up to 15 seconds; this clip reports ${request.durationSeconds.toFixed(1)} s.`;
    }
    if (request.durationSeconds < VIDEO_EDIT_MIN_SECONDS) {
      return "Video Edit needs at least 17 frames (about 0.7 seconds) of video.";
    }
  }
  if (
    (finite(request.sourceWidth) && request.sourceWidth < VIDEO_EDIT_MIN_SIDE_PX) ||
    (finite(request.sourceHeight) && request.sourceHeight < VIDEO_EDIT_MIN_SIDE_PX)
  ) {
    return "Video Edit needs at least 160 pixels on each side.";
  }
  const safety = request.safetyTolerance ?? 2;
  if (!Number.isInteger(safety) || safety < 0 || safety > 4) return "Safety tolerance must be between 0 and 4.";
  return null;
}

export function buildVideoEditPayload(request: VideoEditRequest) {
  const blocker = videoEditRequestBlocker(request);
  if (blocker) throw new Error(blocker);
  return {
    video: request.inputVideo,
    prompt: request.prompt.trim(),
    safety_tolerance: request.safetyTolerance ?? 2
  };
}

export function estimateVideoEditUsd(request: Pick<VideoEditRequest, "durationSeconds">) {
  if (!finite(request.durationSeconds)) return null;
  return Math.round(request.durationSeconds * VIDEO_EDIT_USD_PER_SECOND * 100) / 100;
}

export function redactVideoEditPayload(payload: Record<string, unknown>) {
  return { ...payload, video: "[video input omitted]" };
}
