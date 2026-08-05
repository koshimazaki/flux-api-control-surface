import { FLUX3_ASPECT_RATIOS, flux3MaxDuration, type Flux3VideoMode } from "@/lib/flux3-video";
import { promptPlaceholderIssue } from "@/lib/prompt-placeholders";
import type { VideoScriptRowError, VideoScriptSettings, VideoScriptTimingMode } from "./types";

/** Confirmed FLUX.3 constraints. Kept here so a schema change lands in one place. */
export const FLUX3_MIN_DURATION = 5;
export const FLUX3_MIN_KEYFRAMES = 1;
export const FLUX3_MAX_KEYFRAMES = 10;
/** Requests carrying conditioning media are limited to safety tolerance 0-2. */
export const FLUX3_CONDITIONED_SAFETY_MAX = 2;
export const FLUX3_UNCONDITIONED_SAFETY_MAX = 4;

export type RowValidationInput = {
  mode: Flux3VideoMode;
  assetIds: string[];
  compiledPrompt: string;
  settings: VideoScriptSettings;
  timingMode: VideoScriptTimingMode;
  /** Resolved timing template for this row: the row override or the batch one. */
  timing?: number[];
};

/**
 * Validates the batch-level timing template against one row. Entries must be
 * non-negative, strictly increasing, inside the duration, and one per keyframe.
 */
function validateTiming(input: RowValidationInput): VideoScriptRowError[] {
  if (input.timingMode !== "timed") return [];
  const timing = input.timing;
  if (!timing?.length) {
    return [
      {
        code: "timing_missing",
        message: "Timed batches need a timing template with one timestamp per keyframe."
      }
    ];
  }

  const errors: VideoScriptRowError[] = [];
  if (timing.length !== input.assetIds.length) {
    errors.push({
      code: "timing_count",
      message: `The timing template has ${timing.length} timestamps but this row has ${input.assetIds.length} keyframes.`
    });
  }

  const invalid = timing.some((seconds) => typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0);
  if (invalid) {
    errors.push({ code: "timing_range", message: "Keyframe timestamps must be non-negative numbers of seconds." });
  }

  const increasing = timing.every((seconds, index) => index === 0 || seconds > timing[index - 1]);
  if (!increasing) {
    errors.push({ code: "timing_order", message: "Keyframe timestamps must strictly increase." });
  }

  const { duration } = input.settings;
  if (typeof duration === "number" && timing.some((seconds) => seconds > duration)) {
    errors.push({
      code: "timing_range",
      message: `Keyframe timestamps must stay within the ${duration}s duration.`
    });
  }
  return errors;
}

/**
 * Step 6 of the expansion order: validate FLUX.3 keyframe, prompt, timing,
 * duration, and safety constraints for one planned row. Rows keep their errors
 * instead of being dropped so the matrix can show what to fix.
 */
export function validateVideoScriptRow(input: RowValidationInput): VideoScriptRowError[] {
  const errors: VideoScriptRowError[] = [];
  const keyframes = input.assetIds.length;

  if (keyframes < FLUX3_MIN_KEYFRAMES) {
    errors.push({ code: "keyframe_count", message: "Add at least one image keyframe." });
  } else if (keyframes > FLUX3_MAX_KEYFRAMES) {
    errors.push({
      code: "keyframe_count",
      message: `FLUX.3 accepts up to ${FLUX3_MAX_KEYFRAMES} image keyframes; this row has ${keyframes}.`
    });
  }

  if (!input.compiledPrompt.trim()) {
    errors.push({ code: "prompt_missing", message: "Assign a prompt before this row can be enqueued." });
  } else {
    // A template blank that was never filled would otherwise be sent to the
    // provider verbatim, so an uncompiled `{placeholder}` blocks the row here —
    // the last shared boundary before any paid submit.
    const placeholderIssue = promptPlaceholderIssue(input.compiledPrompt);
    if (placeholderIssue) errors.push({ code: "prompt_placeholders", message: placeholderIssue });
  }

  const maxDuration = flux3MaxDuration(input.mode);
  const { duration } = input.settings;
  if (typeof duration === "number") {
    if (!Number.isInteger(duration) || duration < FLUX3_MIN_DURATION || duration > maxDuration) {
      errors.push({
        code: "duration_range",
        message: `Duration must be a whole number from ${FLUX3_MIN_DURATION} to ${maxDuration} seconds.`
      });
    }
  } else if (input.timingMode === "timed") {
    errors.push({
      code: "duration_required",
      message: "Timed keyframes need a fixed duration so timestamps can be checked against it."
    });
  } else if (keyframes > 2) {
    // One image starts the video and two define start and end; three or more
    // untimed images are distributed evenly and require a fixed duration.
    errors.push({ code: "duration_required", message: "Set a duration when using three or more image keyframes." });
  }

  const maxSafety = keyframes > 0 ? FLUX3_CONDITIONED_SAFETY_MAX : FLUX3_UNCONDITIONED_SAFETY_MAX;
  const safety = input.settings.safetyTolerance;
  if (typeof safety !== "number" || !Number.isInteger(safety) || safety < 0 || safety > maxSafety) {
    errors.push({
      code: "safety_tolerance",
      message: `Safety tolerance must be a whole number from 0 to ${maxSafety} for this mode.`
    });
  }

  if (!FLUX3_ASPECT_RATIOS.includes(input.settings.aspectRatio)) {
    errors.push({ code: "aspect_ratio", message: `"${input.settings.aspectRatio}" is not a supported aspect ratio.` });
  }
  if (input.settings.resolution !== "hd" && input.settings.resolution !== "fhd") {
    errors.push({ code: "resolution", message: `"${input.settings.resolution}" is not a supported resolution.` });
  }

  errors.push(...validateTiming(input));
  return errors;
}
