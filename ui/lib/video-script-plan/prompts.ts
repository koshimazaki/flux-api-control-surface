import type { VideoScriptPrompt, VideoScriptPromptMode, VideoScriptWarning } from "./types";
import { plural, warn } from "./warnings";

/** Combo joins prompts as paragraphs so each selected prompt stays intact. */
export const DEFAULT_PROMPT_SEPARATOR = "\n\n";

export type PromptAssignment = {
  promptIds: string[];
  compiledPrompt: string;
};

export function normalizePrompts(prompts: VideoScriptPrompt[] | undefined, warnings: VideoScriptWarning[]) {
  const normalized: VideoScriptPrompt[] = [];
  let dropped = 0;
  for (const prompt of prompts ?? []) {
    const id = prompt && typeof prompt.id === "string" ? prompt.id.trim() : "";
    const text = prompt && typeof prompt.text === "string" ? prompt.text.trim() : "";
    if (!id || !text) {
      dropped += 1;
      continue;
    }
    normalized.push({ id, text });
  }
  if (dropped) {
    warn(warnings, "prompts_dropped", `Ignored ${dropped} empty prompt ${plural(dropped, "entry", "entries")}.`, {
      count: dropped
    });
  }
  return normalized;
}

/**
 * Step 5 of the expansion order. Cartesian is the only mode that multiplies rows
 * and it only ever runs when it was explicitly selected: selecting several
 * prompts under any other mode assigns them, it never expands the batch.
 */
export function assignPrompts<T extends { assetIds: string[] }>(
  rows: T[],
  prompts: VideoScriptPrompt[],
  mode: VideoScriptPromptMode,
  separator: string,
  warnings: VideoScriptWarning[]
): Array<T & PromptAssignment & { promptIndex: number }> {
  const empty = { promptIds: [] as string[], compiledPrompt: "", promptIndex: 0 };
  if (!rows.length) return [];
  if (!prompts.length) {
    warn(warnings, "prompts_missing", "No prompt is assigned, so every row is incomplete.", { count: rows.length });
    return rows.map((row) => ({ ...row, ...empty }));
  }

  if (mode === "combo") {
    const assignment = {
      promptIds: prompts.map((prompt) => prompt.id),
      compiledPrompt: prompts.map((prompt) => prompt.text).join(separator),
      promptIndex: 0
    };
    return rows.map((row) => ({ ...row, ...assignment }));
  }

  if (mode === "cartesian") {
    const expanded: Array<T & PromptAssignment & { promptIndex: number }> = [];
    for (const row of rows) {
      prompts.forEach((prompt, promptIndex) => {
        expanded.push({ ...row, promptIds: [prompt.id], compiledPrompt: prompt.text, promptIndex });
      });
    }
    return expanded;
  }

  if (mode === "zip") {
    const length = Math.min(rows.length, prompts.length);
    if (rows.length !== prompts.length) {
      const dropped = Math.abs(rows.length - prompts.length);
      warn(
        warnings,
        "prompt_zip_length_mismatch",
        `Zip needs one prompt per row: ${rows.length} ${plural(rows.length, "row", "rows")} and ${prompts.length} ${plural(prompts.length, "prompt", "prompts")} were given, so the batch is truncated to ${length}.`,
        { count: dropped, limit: length }
      );
    }
    return rows.slice(0, length).map((row, index) => ({
      ...row,
      promptIds: [prompts[index].id],
      compiledPrompt: prompts[index].text,
      promptIndex: index
    }));
  }

  if (mode === "rotate") {
    return rows.map((row, index) => {
      const promptIndex = index % prompts.length;
      return {
        ...row,
        promptIds: [prompts[promptIndex].id],
        compiledPrompt: prompts[promptIndex].text,
        promptIndex
      };
    });
  }

  // single
  if (prompts.length > 1) {
    const ignored = prompts.length - 1;
    warn(
      warnings,
      "prompts_ignored",
      `Single-prompt mode used "${prompts[0].id}" and ignored ${ignored} other ${plural(ignored, "prompt", "prompts")}.`,
      { count: ignored }
    );
  }
  const assignment = { promptIds: [prompts[0].id], compiledPrompt: prompts[0].text, promptIndex: 0 };
  return rows.map((row) => ({ ...row, ...assignment }));
}
