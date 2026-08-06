import type { VideoScriptSlotBinding } from "@/lib/video-script-plan";
import {
  MAX_VIDEO_SCRIPT_SLOTS,
  emptyColumns,
  type VideoScriptEditorRow,
  type VideoScriptEditorState
} from "./types";

/**
 * Pure row and slot operations for the keyframe matrix.
 *
 * Every mutation here returns new state so React can compare cheaply, and every
 * hand edit sets `edited: true` — the flag the regeneration merge protects.
 */

let rowCounter = 0;

/** Deterministic-enough row id; uniqueness within a session is all that matters. */
export function newRowId(prefix = "row") {
  rowCounter += 1;
  return `${prefix}_${rowCounter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clampSlotCount(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_VIDEO_SCRIPT_SLOTS, Math.trunc(value)));
}

/** Pads or trims a row to the matrix width without disturbing filled slots. */
function fitSlots(slots: Array<string | null>, slotCount: number) {
  const next = slots.slice(0, slotCount);
  while (next.length < slotCount) next.push(null);
  return next;
}

export function emptyRow(slotCount: number, origin: VideoScriptEditorRow["origin"] = "manual"): VideoScriptEditorRow {
  return {
    id: newRowId(),
    slots: fitSlots([], slotCount),
    origin,
    // A hand-authored row is edited by definition, so regeneration preserves it.
    edited: origin === "manual"
  };
}

export function rowFromAssetIds(assetIds: string[], slotCount: number): VideoScriptEditorRow {
  return { id: newRowId("kf"), slots: fitSlots([...assetIds], slotCount), origin: "generated", edited: false };
}

/** Keyframe identity of a row, used to keep regeneration from adding duplicates. */
export function rowSignature(row: VideoScriptEditorRow) {
  return JSON.stringify(row.slots.filter((assetId): assetId is string => Boolean(assetId)));
}

export function rowAssetIds(row: VideoScriptEditorRow) {
  return row.slots.filter((assetId): assetId is string => Boolean(assetId));
}

export function setSlotCount(state: VideoScriptEditorState, slotCount: number): VideoScriptEditorState {
  const count = clampSlotCount(slotCount);
  if (count === state.slotCount) return state;
  const columns = emptyColumns(count).map((binding, index) => state.columns[index] ?? binding);
  return {
    ...state,
    slotCount: count,
    columns,
    rows: state.rows.map((row) => ({ ...row, slots: fitSlots(row.slots, count) }))
  };
}

/**
 * Cell drop: overrides one row's slot and marks the row edited. This is the
 * narrow gesture — it never changes how the batch is generated.
 */
export function setRowSlot(
  state: VideoScriptEditorState,
  rowId: string,
  slotIndex: number,
  assetId: string | null
): VideoScriptEditorState {
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.id !== rowId) return row;
      const slots = fitSlots(row.slots, state.slotCount);
      slots[slotIndex] = assetId;
      return { ...row, slots, edited: true };
    })
  };
}

/**
 * Removes a keyframe and closes the gap — later images slide left, and the
 * freed slot reappears empty at the end of the row. Position has no meaning
 * beyond order, so compacting keeps what the user sees aligned with what the
 * provider receives.
 */
export function removeRowSlot(
  state: VideoScriptEditorState,
  rowId: string,
  slotIndex: number
): VideoScriptEditorState {
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.id !== rowId) return row;
      const slots = fitSlots(row.slots, state.slotCount);
      if (slotIndex < 0 || slotIndex >= slots.length) return row;
      slots.splice(slotIndex, 1);
      slots.push(null);
      return { ...row, slots, edited: true };
    })
  };
}

/** Moves a keyframe inside one row; also a hand edit. */
export function moveRowSlot(
  state: VideoScriptEditorState,
  rowId: string,
  from: number,
  to: number
): VideoScriptEditorState {
  if (from === to) return state;
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.id !== rowId) return row;
      const slots = fitSlots(row.slots, state.slotCount);
      if (from < 0 || to < 0 || from >= slots.length || to >= slots.length) return row;
      const [moved] = slots.splice(from, 1);
      slots.splice(to, 0, moved ?? null);
      return { ...row, slots, edited: true };
    })
  };
}

/**
 * Column drop: binds a keyframe position to a pool (or pins one asset there).
 * This is the batch-authoring gesture and deliberately leaves rows untouched
 * until the user regenerates.
 */
export function bindColumn(
  state: VideoScriptEditorState,
  slotIndex: number,
  binding: VideoScriptSlotBinding
): VideoScriptEditorState {
  if (slotIndex < 0 || slotIndex >= state.slotCount) return state;
  const columns = state.columns.slice();
  columns[slotIndex] = binding;
  return { ...state, columns, workflow: "per-slot" };
}

export function addRow(state: VideoScriptEditorState): VideoScriptEditorState {
  return { ...state, rows: [...state.rows, emptyRow(state.slotCount)] };
}

export function duplicateRow(state: VideoScriptEditorState, rowId: string): VideoScriptEditorState {
  const index = state.rows.findIndex((row) => row.id === rowId);
  if (index < 0) return state;
  const source = state.rows[index];
  // A duplicate is hand-authored work, so it carries manual provenance.
  const copy: VideoScriptEditorRow = {
    ...source,
    id: newRowId(),
    slots: source.slots.slice(),
    origin: "manual",
    edited: true,
    timingOverride: source.timingOverride ? [...source.timingOverride] : undefined,
    settingsOverride: source.settingsOverride ? { ...source.settingsOverride } : undefined
  };
  const rows = state.rows.slice();
  rows.splice(index + 1, 0, copy);
  return { ...state, rows };
}

export function deleteRow(state: VideoScriptEditorState, rowId: string): VideoScriptEditorState {
  return { ...state, rows: state.rows.filter((row) => row.id !== rowId) };
}

export function moveRow(state: VideoScriptEditorState, from: number, to: number): VideoScriptEditorState {
  if (from === to || from < 0 || to < 0 || from >= state.rows.length || to >= state.rows.length) return state;
  const rows = state.rows.slice();
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  return { ...state, rows };
}

export function setRowTiming(
  state: VideoScriptEditorState,
  rowId: string,
  timing: number[] | undefined
): VideoScriptEditorState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.id === rowId ? { ...row, timingOverride: timing ? [...timing] : undefined, edited: true } : row
    )
  };
}

export function setRowSettings(
  state: VideoScriptEditorState,
  rowId: string,
  override: Partial<VideoScriptEditorRow["settingsOverride"]> | undefined
): VideoScriptEditorState {
  return {
    ...state,
    rows: state.rows.map((row) =>
      row.id === rowId ? { ...row, settingsOverride: override ? { ...override } : undefined, edited: true } : row
    )
  };
}

/** Explicit discard: the only way an edited row loses its protection. */
export function clearEditedRows(state: VideoScriptEditorState): VideoScriptEditorState {
  return { ...state, rows: state.rows.filter((row) => !row.edited) };
}

export function resetRowEdits(state: VideoScriptEditorState, rowId: string): VideoScriptEditorState {
  return {
    ...state,
    rows: state.rows.map((row) => (row.id === rowId ? { ...row, edited: false, origin: "generated" } : row))
  };
}

export type RegenerateOutcome = {
  rows: VideoScriptEditorRow[];
  /** Edited rows that survived the regeneration. */
  preserved: number;
  /** Fresh generator rows that were placed. */
  generated: number;
  /** Generator rows dropped because an edited row already covers them. */
  skippedDuplicates: number;
};

/**
 * Matrix interaction commitment: regeneration replaces or removes only unedited
 * rows. Edited and hand-authored rows keep their position and are never
 * silently clobbered; a fresh row that duplicates one of them is dropped rather
 * than added twice.
 */
export function regenerateRows(current: VideoScriptEditorRow[], expanded: string[][], slotCount: number): RegenerateOutcome {
  const preservedRows = current.filter((row) => row.edited);
  const taken = new Set(preservedRows.map(rowSignature));
  const incoming: VideoScriptEditorRow[] = [];
  let skippedDuplicates = 0;

  for (const assetIds of expanded) {
    const candidate = rowFromAssetIds(assetIds, slotCount);
    const signature = rowSignature(candidate);
    if (taken.has(signature)) {
      skippedDuplicates += 1;
      continue;
    }
    taken.add(signature);
    incoming.push(candidate);
  }

  // Walk the existing order, holding edited rows in place and streaming the
  // fresh rows through the slots the unedited rows used to occupy.
  const rows: VideoScriptEditorRow[] = [];
  let cursor = 0;
  for (const row of current) {
    if (row.edited) {
      rows.push(row);
      continue;
    }
    if (cursor < incoming.length) {
      rows.push(incoming[cursor]);
      cursor += 1;
    }
  }
  while (cursor < incoming.length) {
    rows.push(incoming[cursor]);
    cursor += 1;
  }

  return { rows, preserved: preservedRows.length, generated: incoming.length, skippedDuplicates };
}
