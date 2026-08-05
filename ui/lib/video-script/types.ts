import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import {
  DEFAULT_VIDEO_SCRIPT_HARD_CAP,
  DEFAULT_VIDEO_SCRIPT_SETTINGS,
  type VideoScriptPromptMode,
  type VideoScriptSequenceMode,
  type VideoScriptSettings,
  type VideoScriptSlotBinding,
  type VideoScriptSlotStrategy,
  type VideoScriptTimingMode
} from "@/lib/video-script-plan";

/**
 * Editor state for the Video Script surface.
 *
 * This module is the glue between the deterministic `video-script-plan` engine
 * and the React matrix. It owns row/slot provenance and drop-target semantics;
 * it never re-implements expansion, validation, or cost, which stay in the
 * planner. Nothing here holds media, base64, or secrets — only asset ids.
 */

/** MIME used when dragging a source pool (a Collection) onto a slot column. */
export const VIDEO_SCRIPT_POOL_MIME = "application/x-bfl-video-pool";
/** MIME used when dragging one matrix row onto another to reorder. */
export const VIDEO_SCRIPT_ROW_MIME = "application/x-bfl-video-row";

/**
 * Asset drags reuse the dashboard-wide `asset:<id>` payload so a tile dragged
 * from the Assets library, a reference dock, or this panel all land the same
 * way. Pool drags use their own MIME because they mean something different:
 * binding a whole column, not filling one cell.
 */
export function readAssetDragId(dataTransfer: DataTransfer | null) {
  const payload = dataTransfer?.getData(BFL_IMAGE_OPTION_MIME) || dataTransfer?.getData("text/plain") || "";
  return payload.startsWith("asset:") ? payload.slice("asset:".length) : "";
}

export function readPoolDragId(dataTransfer: DataTransfer | null) {
  const payload = dataTransfer?.getData(VIDEO_SCRIPT_POOL_MIME) || "";
  return payload.startsWith("pool:") ? payload.slice("pool:".length) : "";
}

/** Four slots are visible by default; a row can expand to the API maximum. */
export const DEFAULT_VIDEO_SCRIPT_SLOTS = 4;
export const MAX_VIDEO_SCRIPT_SLOTS = 10;
/** PRD quick presets. 20 seconds is an explicit high-cost choice. */
export const VIDEO_SCRIPT_DURATION_PRESETS = [5, 8, 10, 20];

/** A named pool of source asset ids a slot column can bind to. */
export type VideoScriptSourcePool = {
  id: string;
  label: string;
  /** Set when the pool came from an Asset Collection, for provenance. */
  collectionId?: string;
  assetIds: string[];
};

/**
 * One editable matrix row.
 *
 * `origin` records whether the generator produced the row or a person authored
 * it; `edited` records whether a person has since touched it. Regeneration
 * replaces only rows with `edited === false`, so hand work is never silently
 * clobbered.
 */
export type VideoScriptEditorRow = {
  id: string;
  /** One entry per keyframe position; `null` is an unused position. */
  slots: Array<string | null>;
  origin: "generated" | "manual";
  edited: boolean;
  settingsOverride?: Partial<VideoScriptSettings>;
  /** Per-row timeline override for the batch timing template, in seconds. */
  timingOverride?: number[];
};

export type VideoScriptGeneratorWorkflow = "sequence" | "per-slot";

export type VideoScriptEditorState = {
  pools: VideoScriptSourcePool[];
  /** Visible keyframe positions, 1-10. */
  slotCount: number;
  /** Per-position binding used by the per-slot workflow and column drops. */
  columns: VideoScriptSlotBinding[];
  workflow: VideoScriptGeneratorWorkflow;
  sequencePoolId: string;
  sequenceMode: VideoScriptSequenceMode;
  strategy: VideoScriptSlotStrategy;
  sampleSize: number;
  rows: VideoScriptEditorRow[];
  promptIds: string[];
  promptMode: VideoScriptPromptMode;
  settings: VideoScriptSettings;
  timingMode: VideoScriptTimingMode;
  /** Batch-level timing template applied to every row without an override. */
  timingTemplate: number[];
  /** Repeatable plan expansion only; FLUX.3 exposes no fresh-generation seed. */
  seed: number;
  hardCap: number;
};

export function emptyColumns(slotCount: number): VideoScriptSlotBinding[] {
  return Array.from({ length: slotCount }, () => ({ kind: "manual" }) as VideoScriptSlotBinding);
}

/** Evenly spaced timestamps across a duration, the default timing template. */
export function evenTimingTemplate(slotCount: number, duration: number | "auto") {
  const seconds = typeof duration === "number" && Number.isFinite(duration) ? duration : 8;
  const count = Math.max(1, Math.trunc(slotCount));
  if (count === 1) return [0];
  return Array.from({ length: count }, (_, index) => Math.round(((index * seconds) / (count - 1)) * 100) / 100);
}

export function defaultVideoScriptEditorState(): VideoScriptEditorState {
  return {
    pools: [],
    slotCount: DEFAULT_VIDEO_SCRIPT_SLOTS,
    columns: emptyColumns(DEFAULT_VIDEO_SCRIPT_SLOTS),
    workflow: "sequence",
    sequencePoolId: "",
    sequenceMode: "combination",
    strategy: "cartesian",
    sampleSize: 8,
    rows: [],
    promptIds: [],
    promptMode: "single",
    settings: { ...DEFAULT_VIDEO_SCRIPT_SETTINGS },
    timingMode: "even",
    timingTemplate: evenTimingTemplate(DEFAULT_VIDEO_SCRIPT_SLOTS, DEFAULT_VIDEO_SCRIPT_SETTINGS.duration),
    seed: 1,
    hardCap: DEFAULT_VIDEO_SCRIPT_HARD_CAP
  };
}
