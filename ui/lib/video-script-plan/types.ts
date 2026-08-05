import type { Flux3VideoAspectRatio, Flux3VideoMode, Flux3VideoResolution } from "@/lib/flux3-video";
import type { PromptRecord } from "@/lib/types";

/**
 * Batch settings for a Video Script plan. This mirrors the `Flux3VideoSettings`
 * shape used by the implementation plan: the subset of FLUX.3 request options a
 * planned row owns. Media inputs, API keys, and polling state never live here.
 */
export type VideoScriptSettings = {
  /** Seconds, or "auto" to let FLUX.3 decide (only legal with 1-2 untimed keyframes). */
  duration: number | "auto";
  resolution: Flux3VideoResolution;
  aspectRatio: Flux3VideoAspectRatio;
  draft: boolean;
  generateAudio: boolean;
  safetyTolerance: number;
};

/** PRD defaults: hd, 8 seconds, 16:9, audio on, draft-first, safety tolerance 2. */
export const DEFAULT_VIDEO_SCRIPT_SETTINGS: VideoScriptSettings = {
  duration: 8,
  resolution: "hd",
  aspectRatio: "16:9",
  draft: true,
  generateAudio: true,
  safetyTolerance: 2
};

/**
 * Default cost guardrail. Fifty 8-second HD drafts is about $24 of paid work, so
 * this is a deliberately conservative ceiling the UI is expected to surface and
 * let the user raise.
 */
export const DEFAULT_VIDEO_SCRIPT_HARD_CAP = 50;

/**
 * Ceiling on materialised rows before dedupe. Ordered arrangements of ten images
 * are 3.6M rows; the planner must stay a cheap pure function, so it computes the
 * true raw count analytically and only builds this many rows.
 */
export const DEFAULT_VIDEO_SCRIPT_EXPANSION_LIMIT = 2000;

/** A named pool of source asset IDs a slot column can bind to. */
export type VideoScriptPool = {
  id: string;
  assetIds: string[];
};

/**
 * How one keyframe position is filled.
 * - `pinned`: the same asset in every generated row.
 * - `pool`: the varying position, filled from a source pool.
 * - `manual`: hand-set for this batch; an empty manual slot is an unused position.
 */
export type VideoScriptSlotBinding =
  | { kind: "pinned"; assetId: string }
  | { kind: "pool"; poolId: string }
  | { kind: "manual"; assetId?: string };

/** Sub-modes of the sequence-from-one-pool generator workflow. */
export type VideoScriptSequenceMode = "combination" | "arrangement" | "rotation";

/** Strategies that combine the varying slots of the per-slot generator workflow. */
export type VideoScriptSlotStrategy = "cartesian" | "zip" | "sample";

/**
 * The two generator workflows the UI exposes over the full engine mode list.
 * Fixed/vary/rotate position behaviour falls out of per-slot pin/vary flags
 * rather than appearing as separate menu entries.
 */
export type VideoScriptGenerator =
  | {
      workflow: "sequence";
      /** Pool that fills every keyframe position. */
      poolId: string;
      /** Number of keyframe positions per row (1-10 for a valid FLUX.3 job). */
      slotCount: number;
      mode: VideoScriptSequenceMode;
    }
  | {
      workflow: "per-slot";
      slots: VideoScriptSlotBinding[];
      strategy: VideoScriptSlotStrategy;
      /** Rows to draw for the `sample` strategy. Ignored by cartesian/zip. */
      sampleSize?: number;
    };

export type VideoScriptPromptMode = "single" | "zip" | "rotate" | "combo" | "cartesian";

export type VideoScriptPrompt = {
  id: string;
  text: string;
};

/** Adapts a stored prompt-library record to the planner's prompt input. */
export function videoScriptPromptFromRecord(record: Pick<PromptRecord, "id" | "prompt">): VideoScriptPrompt {
  return { id: record.id, text: record.prompt };
}

export type VideoScriptTimingMode = "even" | "timed";

/**
 * A hand-authored row. Manual rows are emitted before generated rows, take part
 * in dedupe, and survive regeneration, which is how "edited rows are preserved"
 * is expressed to the planner.
 */
export type VideoScriptManualRow = {
  id?: string;
  assetIds: string[];
  settingsOverride?: Partial<VideoScriptSettings>;
  /** Per-row timeline override for the batch timing template. */
  timingOverride?: number[];
};

export type VideoScriptRateMode = "t2v" | "i2v" | "v2v";
export type VideoScriptRateTier = "draft" | "hd" | "fhd";

/**
 * Per-second USD rates keyed by mode and tier. Kept as data (not inline numbers)
 * so a reconciliation pass against BFL's returned `cost` can replace the table
 * without touching planner logic.
 */
export type VideoScriptRateTable = {
  /** Where the figures came from, for UI provenance. */
  source: string;
  /** ISO date the figures were captured; preview pricing moves. */
  capturedAt: string;
  currency: "USD";
  perSecond: Record<VideoScriptRateMode, Record<VideoScriptRateTier, number>>;
};

export type VideoScriptPlanInput = {
  /** Source pools of asset IDs, addressed by slot bindings. */
  pools?: VideoScriptPool[];
  generator?: VideoScriptGenerator;
  manualRows?: VideoScriptManualRow[];
  prompts?: VideoScriptPrompt[];
  /** Defaults to `single`. Cartesian is never implied by multi-select. */
  promptMode?: VideoScriptPromptMode;
  /** Join string for `combo`. Defaults to a blank line between prompts. */
  promptSeparator?: string;
  timingMode?: VideoScriptTimingMode;
  /** Batch-level timing template in seconds, one entry per keyframe. */
  timingTemplate?: number[];
  settings?: Partial<VideoScriptSettings>;
  /** Repeatable plan expansion only. FLUX.3 exposes no fresh-generation seed. */
  seed?: number;
  hardCap?: number;
  expansionLimit?: number;
  rates?: VideoScriptRateTable;
};

export type VideoScriptWarningCode =
  | "source_duplicates_dropped"
  | "missing_pool"
  | "empty_slot_skipped"
  | "pool_too_small"
  | "zip_length_mismatch"
  | "sample_incomplete"
  | "expansion_limited"
  | "row_dedupe_dropped"
  | "prompts_missing"
  | "prompts_dropped"
  | "prompts_ignored"
  | "prompt_zip_length_mismatch"
  | "cap_truncated"
  | "invalid_rows"
  | "no_rows";

export type VideoScriptWarning = {
  code: VideoScriptWarningCode;
  message: string;
  /** How many items the warning is about (rows dropped, prompts ignored, ...). */
  count?: number;
  /** The limit that produced the warning, when one applies. */
  limit?: number;
};

export type VideoScriptErrorCode =
  | "keyframe_count"
  | "prompt_missing"
  | "prompt_placeholders"
  | "duration_required"
  | "duration_range"
  | "safety_tolerance"
  | "timing_missing"
  | "timing_count"
  | "timing_order"
  | "timing_range"
  | "aspect_ratio"
  | "resolution";

export type VideoScriptRowError = {
  code: VideoScriptErrorCode;
  message: string;
};

/** One keyframe position of a planned row, matching the documented slot shape. */
export type VideoScriptPlanSlot = {
  id: string;
  assetId: string;
  /** Present only for timed rows. */
  seconds?: number;
};

export type VideoScriptPlanRow = {
  id: string;
  index: number;
  /** `manual` rows were hand-authored; `generated` rows came from the expander. */
  origin: "manual" | "generated";
  /** Identity of the deduplicated keyframe row this job came from. */
  sourceRowId: string;
  slots: VideoScriptPlanSlot[];
  /** Ordered keyframe asset IDs; media is resolved server-side at execution. */
  assetIds: string[];
  /** `[seconds, assetId]` pairs for timed rows; absent for evenly spaced rows. */
  timedKeyframes?: Array<[number, string]>;
  promptIds: string[];
  /** Compiled prompt text. Empty when no prompt is assigned yet. */
  compiledPrompt: string;
  settingsOverride?: Partial<VideoScriptSettings>;
  /** Batch settings with the row override applied. */
  settings: VideoScriptSettings;
  mode: Flux3VideoMode;
  estimatedUsd: number | null;
  errors: VideoScriptRowError[];
};

export type VideoScriptPlanPreview = {
  /** Rows the selected mode would expand to, before dedupe or any limit. */
  rawRowCount: number;
  /** Distinct ordered keyframe rows that survived dedupe. */
  uniqueRowCount: number;
  /** Jobs after prompt assignment (only `cartesian` multiplies rows). */
  promptExpandedRowCount: number;
  /** Jobs after the hard cap; the number that would be enqueued. */
  cappedRowCount: number;
  promptCount: number;
  validRowCount: number;
  invalidRowCount: number;
  /** Sum over rows with no validation errors, so it matches what can be run. */
  estimatedTotalUsd: number;
  /** Human-readable job equation, e.g. "12 image rows x 3 prompts = 36 jobs". */
  equation: string;
};

export type VideoScriptPlan = {
  seed: number;
  hardCap: number;
  settings: VideoScriptSettings;
  promptMode: VideoScriptPromptMode;
  timingMode: VideoScriptTimingMode;
  timingTemplate?: number[];
  rows: VideoScriptPlanRow[];
  warnings: VideoScriptWarning[];
  preview: VideoScriptPlanPreview;
  rates: VideoScriptRateTable;
};
