import { MessageSquareText } from "lucide-react";
import type { PromptRecord } from "@/lib/types";
import type { VideoScriptPromptMode } from "@/lib/video-script-plan";

/**
 * Prompt assignment over the existing prompt-library records. Cartesian is a
 * deliberate choice here, never implied by multi-select, because it is the only
 * mode that multiplies the batch.
 */
export type VideoScriptPromptPickerProps = {
  prompts: PromptRecord[];
  selectedIds: string[];
  mode: VideoScriptPromptMode;
  equation: string;
  onToggle: (id: string) => void;
  onClear: () => void;
  onModeChange: (mode: VideoScriptPromptMode) => void;
};

const MODES: Array<{ id: VideoScriptPromptMode; label: string; detail: string }> = [
  { id: "single", label: "One prompt", detail: "the first selected prompt runs on every row" },
  { id: "zip", label: "Zip", detail: "one prompt per row, in order" },
  { id: "rotate", label: "Rotate", detail: "cycle the selected prompts through the rows" },
  { id: "combo", label: "Combine", detail: "join the selected prompts into one prompt" },
  { id: "cartesian", label: "Cartesian", detail: "multiply every row by every prompt" }
];

export function VideoScriptPromptPicker(props: VideoScriptPromptPickerProps) {
  return (
    <section className="videoScriptPrompts">
      <div className="runLogHeader">
        <span>Prompts</span>
        <small>{props.selectedIds.length} selected</small>
      </div>

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
        {props.prompts.map((prompt) => {
          const order = props.selectedIds.indexOf(prompt.id);
          return (
            <button
              key={prompt.id}
              type="button"
              className={order >= 0 ? "videoScriptPromptChip selected" : "videoScriptPromptChip"}
              onClick={() => props.onToggle(prompt.id)}
              title={prompt.prompt}
            >
              <strong>{prompt.id}</strong>
              <small>{prompt.prompt.slice(0, 72) || "empty prompt"}</small>
              {order >= 0 && <span>{order + 1}</span>}
            </button>
          );
        })}
        {!props.prompts.length && <div className="scriptEmpty">No prompt records are loaded.</div>}
      </div>

      <button type="button" onClick={props.onClear} disabled={!props.selectedIds.length}>
        Clear prompt selection
      </button>
    </section>
  );
}
