import type { Flux3VideoMode } from "@/lib/flux3-video";
import { estimateVideoUsd, FLUX3_VIDEO_RATES, roundUsd } from "./cost";
import { dedupeRows, expandImageRows, normalizeAssetIds, normalizePools } from "./expand";
import { assignPrompts, DEFAULT_PROMPT_SEPARATOR, normalizePrompts } from "./prompts";
import { normalizeSeed } from "./rng";
import {
  DEFAULT_VIDEO_SCRIPT_EXPANSION_LIMIT,
  DEFAULT_VIDEO_SCRIPT_HARD_CAP,
  DEFAULT_VIDEO_SCRIPT_SETTINGS,
  type VideoScriptManualRow,
  type VideoScriptPlan,
  type VideoScriptPlanInput,
  type VideoScriptPlanRow,
  type VideoScriptPlanSlot,
  type VideoScriptSettings,
  type VideoScriptWarning
} from "./types";
import { validateVideoScriptRow } from "./validate";
import { plural, warn } from "./warnings";

type DraftRow = {
  sourceRowId: string;
  origin: "manual" | "generated";
  assetIds: string[];
  settingsOverride?: Partial<VideoScriptSettings>;
  timingOverride?: number[];
};

/** Applies an override without letting explicit `undefined` erase a default. */
export function mergeVideoScriptSettings(
  base: VideoScriptSettings,
  override?: Partial<VideoScriptSettings>
): VideoScriptSettings {
  const merged: VideoScriptSettings = { ...base };
  for (const [key, value] of Object.entries(override ?? {})) {
    if (value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/**
 * Keeps the template the caller supplied, mapping non-numbers to NaN rather than
 * dropping them, so validation reports a bad timestamp instead of a silent
 * count mismatch.
 */
function normalizeTimingTemplate(values: unknown): number[] | undefined {
  if (!Array.isArray(values)) return undefined;
  return values.map((value) => (typeof value === "number" ? value : Number.NaN));
}

function pad(value: number) {
  return String(value).padStart(3, "0");
}

function positiveInteger(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

function uniqueId(candidate: string, used: Set<string>) {
  let id = candidate;
  let suffix = 2;
  while (used.has(id)) {
    id = `${candidate}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

/** Step 2: hand-authored rows, emitted before generated rows so they win dedupe. */
function normalizeManualRows(rows: VideoScriptManualRow[] | undefined): DraftRow[] {
  const drafts: DraftRow[] = [];
  (rows ?? []).forEach((row, index) => {
    if (!row) return;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `manual_${pad(index + 1)}`;
    drafts.push({
      sourceRowId: id,
      origin: "manual",
      assetIds: normalizeAssetIds(row.assetIds),
      settingsOverride: row.settingsOverride,
      timingOverride: normalizeTimingTemplate(row.timingOverride)
    });
  });
  return drafts;
}

/**
 * Deterministic Video Script permutation planner.
 *
 * Pure: no filesystem, network, React, `Date.now`, or `Math.random`. The same
 * input and seed always produce the same rows, warnings, and estimate.
 *
 * Expansion order (implementation plan, "Video Planning Engine"):
 * 1. normalize and deduplicate source asset IDs;
 * 2. apply pinned/manual slots;
 * 3. expand the selected image permutation mode;
 * 4. deduplicate identical ordered keyframe rows;
 * 5. apply the prompt assignment mode;
 * 6. validate FLUX 3 keyframe, timing, duration, and safety constraints;
 * 7. apply the hard job cap;
 * 8. estimate cost and emit queue-ready rows.
 */
export function planVideoScript(input: VideoScriptPlanInput = {}): VideoScriptPlan {
  const warnings: VideoScriptWarning[] = [];
  const settings = mergeVideoScriptSettings(DEFAULT_VIDEO_SCRIPT_SETTINGS, input.settings);
  const seed = normalizeSeed(input.seed);
  const hardCap = positiveInteger(input.hardCap, DEFAULT_VIDEO_SCRIPT_HARD_CAP);
  const expansionLimit = Math.max(hardCap, positiveInteger(input.expansionLimit, DEFAULT_VIDEO_SCRIPT_EXPANSION_LIMIT));
  const rates = input.rates ?? FLUX3_VIDEO_RATES;
  const promptMode = input.promptMode ?? "single";
  const timingMode = input.timingMode === "timed" ? "timed" : "even";
  const timingTemplate = normalizeTimingTemplate(input.timingTemplate);
  const separator = typeof input.promptSeparator === "string" ? input.promptSeparator : DEFAULT_PROMPT_SEPARATOR;

  // 1-3: sources, pinned/manual slots, then the selected image mode.
  const pools = normalizePools(input.pools, warnings);
  const manualDrafts = normalizeManualRows(input.manualRows);
  const expansion = expandImageRows(input.generator, pools, { seed, limit: expansionLimit }, warnings);
  const generatedDrafts: DraftRow[] = expansion.rows.map((assetIds, index) => ({
    sourceRowId: `kf_${pad(index + 1)}`,
    origin: "generated",
    assetIds
  }));
  const rawRowCount = manualDrafts.length + expansion.rawCount;
  if (expansion.rows.length < expansion.rawCount) {
    const skipped = expansion.rawCount - expansion.rows.length;
    warn(
      warnings,
      "expansion_limited",
      `The selected mode expands to ${expansion.rawCount} rows; only the first ${expansion.rows.length} were built (expansion limit ${expansionLimit}).`,
      { count: skipped, limit: expansionLimit }
    );
  }

  // 4: identical ordered keyframe rows collapse, keeping the first occurrence.
  const deduped = dedupeRows([...manualDrafts, ...generatedDrafts]);
  if (deduped.dropped) {
    warn(
      warnings,
      "row_dedupe_dropped",
      `Removed ${deduped.dropped} duplicate keyframe ${plural(deduped.dropped, "row", "rows")}.`,
      { count: deduped.dropped }
    );
  }
  const uniqueRowCount = deduped.rows.length;

  // 5: prompt assignment. Only `cartesian` multiplies rows.
  const prompts = normalizePrompts(input.prompts, warnings);
  const assigned = assignPrompts(deduped.rows, prompts, promptMode, separator, warnings);
  const promptExpandedRowCount = assigned.length;

  // 7 before 6 only as an optimisation: validation is per row and pure, so
  // validating just the capped slice cannot change any surviving row's errors.
  const kept = assigned.slice(0, hardCap);
  if (assigned.length > hardCap) {
    const dropped = assigned.length - hardCap;
    warn(
      warnings,
      "cap_truncated",
      `Capped at ${hardCap} ${plural(hardCap, "job", "jobs")}; ${dropped} planned ${plural(dropped, "row", "rows")} were dropped.`,
      { count: dropped, limit: hardCap }
    );
  }

  // 6 and 8: materialise, validate, and price each surviving row.
  const usedIds = new Set<string>();
  const rows: VideoScriptPlanRow[] = kept.map((draft, index) => {
    const rowSettings = mergeVideoScriptSettings(settings, draft.settingsOverride);
    const timing = timingMode === "timed" ? (draft.timingOverride ?? timingTemplate) : undefined;
    const assetIds = draft.assetIds;
    const timed = Boolean(timing && assetIds.length > 0 && timing.length === assetIds.length);
    const id = uniqueId(
      promptMode === "cartesian" ? `${draft.sourceRowId}_p${draft.promptIndex + 1}` : draft.sourceRowId,
      usedIds
    );
    const slots: VideoScriptPlanSlot[] = assetIds.map((assetId, slotIndex) => ({
      id: `${id}_s${slotIndex + 1}`,
      assetId,
      ...(timed ? { seconds: timing![slotIndex] } : {})
    }));
    const mode: Flux3VideoMode = assetIds.length ? "i2v" : "t2v";
    const errors = validateVideoScriptRow({
      mode,
      assetIds,
      compiledPrompt: draft.compiledPrompt,
      settings: rowSettings,
      timingMode,
      timing
    });

    return {
      id,
      index,
      origin: draft.origin,
      sourceRowId: draft.sourceRowId,
      slots,
      assetIds,
      ...(timed ? { timedKeyframes: assetIds.map((assetId, i) => [timing![i], assetId] as [number, string]) } : {}),
      promptIds: draft.promptIds,
      compiledPrompt: draft.compiledPrompt,
      ...(draft.settingsOverride ? { settingsOverride: draft.settingsOverride } : {}),
      settings: rowSettings,
      mode,
      estimatedUsd: estimateVideoUsd(
        { mode, duration: rowSettings.duration, draft: rowSettings.draft, resolution: rowSettings.resolution },
        rates
      ),
      errors
    };
  });

  const validRows = rows.filter((row) => !row.errors.length);
  const invalidRowCount = rows.length - validRows.length;
  if (invalidRowCount) {
    warn(
      warnings,
      "invalid_rows",
      `${invalidRowCount} ${plural(invalidRowCount, "row", "rows")} cannot be enqueued until the reported errors are fixed.`,
      { count: invalidRowCount }
    );
  }
  if (!rows.length) {
    warn(warnings, "no_rows", "This plan produced no rows.", { count: 0 });
  }

  // Estimates cover only enqueueable rows so the guardrail matches what runs.
  const estimatedTotalUsd = roundUsd(validRows.reduce((total, row) => total + (row.estimatedUsd ?? 0), 0));
  const promptFactor = promptMode === "cartesian" ? Math.max(prompts.length, 1) : 1;
  const projected = uniqueRowCount * promptFactor;
  let equation = `${uniqueRowCount} image ${plural(uniqueRowCount, "row", "rows")} × ${promptFactor} ${plural(
    promptFactor,
    "prompt",
    "prompts"
  )} = ${projected} ${plural(projected, "job", "jobs")}`;
  if (rows.length !== projected) equation += ` → ${rows.length} after limits`;

  return {
    seed,
    hardCap,
    settings,
    promptMode,
    timingMode,
    ...(timingTemplate ? { timingTemplate } : {}),
    rows,
    warnings,
    preview: {
      rawRowCount,
      uniqueRowCount,
      promptExpandedRowCount,
      cappedRowCount: rows.length,
      promptCount: prompts.length,
      validRowCount: validRows.length,
      invalidRowCount,
      estimatedTotalUsd,
      equation
    },
    rates
  };
}
