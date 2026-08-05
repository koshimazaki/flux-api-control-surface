/**
 * Deterministic Video Script permutation planner.
 *
 * `planVideoScript` turns source pools, slot bindings, prompts, timing, and
 * settings into repeatable editable rows plus the raw -> unique -> capped ->
 * estimated-cost preview chain the batch UI shows before any paid execution.
 * The module is pure and holds no provider, queue, or storage logic.
 */
export { planVideoScript, mergeVideoScriptSettings } from "./plan";
export { estimateVideoUsd, videoRateMode, videoRateTier, roundUsd, FLUX3_VIDEO_RATES } from "./cost";
export { mulberry32, normalizeSeed, randomIndex } from "./rng";
export { dedupeRows, expandImageRows, normalizeAssetIds, normalizePools, rowKey } from "./expand";
export { assignPrompts, normalizePrompts, DEFAULT_PROMPT_SEPARATOR } from "./prompts";
export {
  validateVideoScriptRow,
  FLUX3_CONDITIONED_SAFETY_MAX,
  FLUX3_MAX_KEYFRAMES,
  FLUX3_MIN_DURATION,
  FLUX3_MIN_KEYFRAMES,
  FLUX3_UNCONDITIONED_SAFETY_MAX
} from "./validate";
export {
  DEFAULT_VIDEO_SCRIPT_EXPANSION_LIMIT,
  DEFAULT_VIDEO_SCRIPT_HARD_CAP,
  DEFAULT_VIDEO_SCRIPT_SETTINGS,
  videoScriptPromptFromRecord
} from "./types";
export type {
  VideoScriptErrorCode,
  VideoScriptGenerator,
  VideoScriptManualRow,
  VideoScriptPlan,
  VideoScriptPlanInput,
  VideoScriptPlanPreview,
  VideoScriptPlanRow,
  VideoScriptPlanSlot,
  VideoScriptPool,
  VideoScriptPrompt,
  VideoScriptPromptMode,
  VideoScriptRateMode,
  VideoScriptRateTable,
  VideoScriptRateTier,
  VideoScriptRowError,
  VideoScriptSequenceMode,
  VideoScriptSettings,
  VideoScriptSlotBinding,
  VideoScriptSlotStrategy,
  VideoScriptTimingMode,
  VideoScriptWarning,
  VideoScriptWarningCode
} from "./types";
export type { ExpansionResult } from "./expand";
export type { PromptAssignment } from "./prompts";
export type { RowValidationInput } from "./validate";
