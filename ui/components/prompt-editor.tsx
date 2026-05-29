import { Clipboard, RotateCcw, Save, Upload, Wand2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import type { PromptRecord } from "@/lib/types";
import { applyPresetToPrompt, compactPrompt, presets } from "@/lib/prompt-utils";

type PromptEditorProps = {
  activePrompt?: PromptRecord;
  promptText: string;
  onPromptChange: (value: string) => void;
  onImport: () => void;
  onSave: () => void;
  onReset: () => void;
};

export function PromptEditor({
  activePrompt,
  promptText,
  onPromptChange,
  onImport,
  onSave,
  onReset
}: PromptEditorProps) {
  return (
    <section className="panel editor">
      <div className="panelHeader">
        <div>
          <h2>{activePrompt?.id || "Prompt"}</h2>
          <p>{activePrompt?.plant_form || "Structured FLUX.2 prompt"}</p>
        </div>
        <div className="presetRow">
          {presets.map((preset) => (
            <button key={preset.id} onClick={() => onPromptChange(applyPresetToPrompt(promptText, preset))}>
              <Wand2 size={15} />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="promptEditor"
        value={promptText}
        onChange={(event) => onPromptChange(event.target.value)}
        spellCheck={false}
      />

      <div className="editorActions">
        <button onClick={onImport}>
          <Upload size={16} />
          Import JSON
        </button>
        <button onClick={() => void copyText(compactPrompt(promptText))}>
          <Clipboard size={16} />
          Copy Prompt
        </button>
        <button onClick={onSave}>
          <Save size={16} />
          Save Prompt
        </button>
        <button onClick={onReset}>
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
    </section>
  );
}
