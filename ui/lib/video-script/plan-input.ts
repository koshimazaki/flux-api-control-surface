import { promptRecordPlaceholderIssue } from "@/lib/prompt-placeholders";
import type { PromptRecord } from "@/lib/types";
import {
  planVideoScript,
  videoScriptPromptFromRecord,
  type VideoScriptGenerator,
  type VideoScriptPlan,
  type VideoScriptPlanInput,
  type VideoScriptPrompt
} from "@/lib/video-script-plan";
import { rowAssetIds } from "./rows";
import type { VideoScriptEditorState } from "./types";

/**
 * Editor state -> planner input. The UI never counts, dedupes, validates, or
 * prices rows itself: both previews below are `planVideoScript` calls, so what
 * the matrix shows is exactly what the engine would enqueue.
 */

export function videoScriptPrompts(records: PromptRecord[], promptIds: string[]): VideoScriptPrompt[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  return promptIds
    .map((id) => byId.get(id))
    .filter((record): record is PromptRecord => Boolean(record))
    .map(videoScriptPromptFromRecord);
}

/**
 * Picker-boundary guard: selected prompts that still carry `{placeholder}`
 * blanks. The planner also refuses these rows, but naming the offending prompt
 * here is what lets the picker say which template is unfinished.
 */
export function videoScriptPromptBlockers(prompts: VideoScriptPrompt[]): string[] {
  return prompts
    .map((prompt) => promptRecordPlaceholderIssue(prompt.id, prompt.text))
    .filter((issue): issue is string => Boolean(issue));
}

/** The generator configuration the two workflow tabs describe. */
export function videoScriptGenerator(state: VideoScriptEditorState): VideoScriptGenerator {
  if (state.workflow === "sequence") {
    return {
      workflow: "sequence",
      poolId: state.sequencePoolId,
      slotCount: state.slotCount,
      mode: state.sequenceMode
    };
  }
  return {
    workflow: "per-slot",
    slots: state.columns.slice(0, state.slotCount),
    strategy: state.strategy,
    sampleSize: state.sampleSize
  };
}

/**
 * Plan for the generator alone. Used for the "this configuration expands to N
 * rows" line and to produce fresh rows for the matrix. Prompts are deliberately
 * absent so prompt Cartesian expansion never multiplies keyframe rows here.
 */
export function planVideoScriptGenerator(state: VideoScriptEditorState): VideoScriptPlan {
  return planVideoScript({
    pools: state.pools.map((pool) => ({ id: pool.id, assetIds: pool.assetIds })),
    generator: videoScriptGenerator(state),
    settings: state.settings,
    seed: state.seed,
    hardCap: state.hardCap
  });
}

/**
 * Plan for the batch as it stands in the matrix. Matrix rows are the plan's
 * hand-authored rows, so edits, per-row overrides, prompts, timing, validation,
 * dedupe, the hard cap, and the cost estimate all come back from one call.
 */
export function videoScriptBatchInput(state: VideoScriptEditorState, prompts: VideoScriptPrompt[]): VideoScriptPlanInput {
  return {
    manualRows: state.rows.map((row) => ({
      id: row.id,
      assetIds: rowAssetIds(row),
      settingsOverride: row.settingsOverride,
      timingOverride: row.timingOverride
    })),
    prompts,
    promptMode: state.promptMode,
    settings: state.settings,
    timingMode: state.timingMode,
    timingTemplate: state.timingMode === "timed" ? state.timingTemplate : undefined,
    seed: state.seed,
    hardCap: state.hardCap
  };
}

export function planVideoScriptBatch(state: VideoScriptEditorState, prompts: VideoScriptPrompt[]): VideoScriptPlan {
  return planVideoScript(videoScriptBatchInput(state, prompts));
}
