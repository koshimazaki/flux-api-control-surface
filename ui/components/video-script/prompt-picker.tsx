import { useMemo } from "react";
import { MessageSquareText } from "lucide-react";
import { groupVideoScriptPrompts } from "@/lib/video-script/prompt-source";
import type { PromptRecord } from "@/lib/types";
import type { VideoScriptPromptMode } from "@/lib/video-script-plan";

/**
 * Secondary library browser for the Video Script surface.
 *
 * Records are grouped by the PRD library menu with video and shared prompts
 * first and image prompts under their own group. Assignment modes still apply
 * to a multi-prompt selection; Cartesian is a deliberate choice here, never
 * implied by multi-select, because it is the only mode that multiplies the
 * batch. While the composer field holds text it outranks this selection, and
 * the header says so rather than quietly ignoring the picked prompts.
 */
export type VideoScriptPromptPickerProps = {
  prompts: PromptRecord[];
  selectedIds: string[];
  mode: VideoScriptPromptMode;
  equation: string;
  /** True when the composer field is the batch prompt instead of this list. */
  composerActive?: boolean;
  onToggle: (id: string) => void;
  onClear: () => void;
  onModeChange: (mode: VideoScriptPromptMode) => void;
  /** Loads one record's text into the composer field. */
  onUsePrompt?: (record: PromptRecord) => void;
};

const MODES: Array<{ id: VideoScriptPromptMode; label: string; detail: string }> = [
  { id: "single", label: "One prompt", detail: "the first selected prompt runs on every row" },
  { id: "zip", label: "Zip", detail: "one prompt per row, in order" },
  { id: "rotate", label: "Rotate", detail: "cycle the selected prompts through the rows" },
  { id: "combo", label: "Combine", detail: "join the selected prompts into one prompt" },
  { id: "cartesian", label: "Cartesian", detail: "multiply every row by every prompt" }
];

export function VideoScriptPromptPicker(props: VideoScriptPromptPickerProps) {
  const groups = useMemo(() => groupVideoScriptPrompts(props.prompts), [props.prompts]);

  return (
    <section className="videoScriptPrompts">
      <div className="runLogHeader">
        <span>From library</span>
        <small>{props.selectedIds.length} selected</small>
      </div>

      {props.composerActive && (
        <p className="videoScriptComposerHint">
          The composer field is driving this batch. Clear it to run the selection below.
        </p>
      )}

      <div className="videoScriptChoiceRow wrap">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={props.mode === mode.id ? "active" : ""}
            onClick={() => props.onModeChange(mode.id)}
            title={mode.detail}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <p className="videoScriptEquation">
        <MessageSquareText size={13} />
        {props.equation}
      </p>

      <div className="videoScriptPromptList">
        {groups.map((group) => (
          <div key={group.id} className="videoScriptPromptGroup">
            <span className="videoScriptPromptGroupLabel">
              {group.label} ({group.prompts.length})
            </span>
            {group.prompts.map((prompt) => {
              const order = props.selectedIds.indexOf(prompt.id);
              return (
                <div key={prompt.id} className="videoScriptPromptRow">
                  <button
                    type="button"
                    className={order >= 0 ? "videoScriptPromptChip selected" : "videoScriptPromptChip"}
                    onClick={() => props.onToggle(prompt.id)}
                    title={prompt.prompt}
                  >
                    <strong>{prompt.id}</strong>
                    <small>{prompt.prompt.slice(0, 72) || "empty prompt"}</small>
                    {order >= 0 && <span>{order + 1}</span>}
                  </button>
                  {props.onUsePrompt && (
                    <button
                      type="button"
                      className="videoScriptPromptEdit"
                      title="Load this prompt into the composer field for editing"
                      onClick={() => props.onUsePrompt?.(prompt)}
                    >
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {!props.prompts.length && <div className="scriptEmpty">No prompt records are loaded.</div>}
      </div>

      <button type="button" onClick={props.onClear} disabled={!props.selectedIds.length}>
        Clear prompt selection
      </button>
    </section>
  );
}
