import { isVideoLibraryPrompt, promptLibraryLabel, promptMediaGroupId } from "@/lib/prompt-library-groups";
import { promptRecordPlaceholderIssue } from "@/lib/prompt-placeholders";
import type { PromptRecord, VideoPromptCategory } from "@/lib/types";
import {
  videoScriptPromptFromRecord,
  type VideoScriptPrompt,
  type VideoScriptPromptMode
} from "@/lib/video-script-plan";
import { videoPromptTemplates } from "@/lib/video-prompt-templates";

/**
 * Which prompt text a Video Script batch actually runs.
 *
 * The composer field is the fast path and the source of truth while it holds
 * text: it behaves as one prompt applied to every row, so a batch never silently
 * mixes a half-written composer draft with a library selection. Clearing the
 * field hands control back to the library selection and its assignment mode.
 */

export const COMPOSER_PROMPT_ID = "composer_prompt";

export type VideoScriptPromptSourceKind = "composer" | "library" | "none";

export type VideoScriptPromptSourceInput = {
  records: PromptRecord[];
  promptIds: string[];
  composerText: string;
  mode: VideoScriptPromptMode;
};

export type VideoScriptPromptSourceResult = {
  source: VideoScriptPromptSourceKind;
  prompts: VideoScriptPrompt[];
  /** Forced to `single` while the composer is the source. */
  mode: VideoScriptPromptMode;
  /** Uncompiled `{placeholder}` blockers; non-empty means nothing may enqueue. */
  blockers: string[];
};

export function videoScriptPromptSource(input: VideoScriptPromptSourceInput): VideoScriptPromptSourceResult {
  const composed = (input.composerText || "").trim();
  if (composed) {
    const prompts = [{ id: COMPOSER_PROMPT_ID, text: composed }];
    return { source: "composer", prompts, mode: "single", blockers: promptBlockers(prompts) };
  }

  const byId = new Map(input.records.map((record) => [record.id, record]));
  const prompts = input.promptIds
    .map((id) => byId.get(id))
    .filter((record): record is PromptRecord => Boolean(record))
    .map(videoScriptPromptFromRecord);

  return {
    source: prompts.length ? "library" : "none",
    prompts,
    mode: input.mode,
    blockers: promptBlockers(prompts)
  };
}

function promptBlockers(prompts: VideoScriptPrompt[]): string[] {
  return prompts
    .map((prompt) => promptRecordPlaceholderIssue(prompt.id, prompt.text))
    .filter((issue): issue is string => Boolean(issue));
}

/** Starter template body for a prompt type, loaded into the composer field. */
export function starterTemplateBody(category: VideoPromptCategory, templateId?: string): string {
  const templates = videoPromptTemplates(category);
  const template = (templateId && templates.find((entry) => entry.id === templateId)) || templates[0];
  return template ? template.body : "";
}

export type VideoScriptPromptGroup = {
  id: string;
  label: string;
  prompts: PromptRecord[];
};

/** Menu order for the secondary library browser: video first, then shared, then image. */
const GROUP_ORDER = [
  "video_simple",
  "video_detailed",
  "video_sequence",
  "video_dialogue_sound",
  "shared_prompts",
  "image_prompts",
  "audio_prompts"
];

/**
 * Groups library records for the Video Script browser. Video and shared prompts
 * come first because this is the video surface; image prompts stay selectable
 * under their own group rather than being hidden.
 */
export function groupVideoScriptPrompts(records: PromptRecord[]): VideoScriptPromptGroup[] {
  const groups = new Map<string, PromptRecord[]>();
  for (const record of records) {
    const id = promptMediaGroupId(record);
    const bucket = groups.get(id);
    if (bucket) bucket.push(record);
    else groups.set(id, [record]);
  }
  return GROUP_ORDER.filter((id) => groups.get(id)?.length).map((id) => ({
    id,
    label: promptLibraryLabel(id),
    prompts: groups.get(id) as PromptRecord[]
  }));
}

/** Count of video/shared records, used for the browser's summary line. */
export function videoLibraryPromptCount(records: PromptRecord[]) {
  return records.filter(isVideoLibraryPrompt).length;
}
