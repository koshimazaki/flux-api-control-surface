import { useEffect, useState } from "react";
import { Clipboard, RotateCcw, Save, SaveAll, Trash2, Upload, Wand2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { PanelHeader } from "@/components/ui/panel-header";
import type { PromptRecord } from "@/lib/types";
import { applyPresetToPrompt, compactPrompt, presets } from "@/lib/prompt-utils";

type PromptEditorProps = {
  activePrompt?: PromptRecord;
  promptText: string;
  onPromptChange: (value: string) => void;
  onImport: () => void;
  onSave: () => void;
  onSaveAsNew: () => void;
  onDelete: () => void;
  onReset: () => void;
};

export function PromptEditor({
  activePrompt,
  promptText,
  onPromptChange,
  onImport,
  onSave,
  onSaveAsNew,
  onDelete,
  onReset
}: PromptEditorProps) {
  const [activePresetId, setActivePresetId] = useState("");

  // Clear the "plugged in" indicator when a different prompt is loaded.
  useEffect(() => {
    setActivePresetId("");
  }, [activePrompt?.id]);

  function applyPreset(preset: (typeof presets)[number]) {
    onPromptChange(applyPresetToPrompt(promptText, preset));
    setActivePresetId(preset.id);
  }

  function editPrompt(value: string) {
    if (activePresetId) setActivePresetId("");
    onPromptChange(value);
  }

  return (
    <section className="panel editor">
      <PanelHeader
        title={activePrompt?.id || "Prompt"}
        subtitle={activePrompt?.plant_form || "Structured FLUX.2 prompt"}
      >
        <div className="presetRow" role="group" aria-label="Look presets">
          {presets.map((preset) => {
            const active = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                className={active ? "presetToggle active" : "presetToggle"}
                aria-pressed={active}
                onClick={() => applyPreset(preset)}
              >
                <Wand2 size={15} />
                {preset.label}
              </button>
            );
          })}
        </div>
      </PanelHeader>

      <textarea
        className="promptEditor"
        value={promptText}
        onChange={(event) => editPrompt(event.target.value)}
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
          Save
        </button>
        <button onClick={onSaveAsNew}>
          <SaveAll size={16} />
          Save As New
        </button>
        <button onClick={onReset}>
          <RotateCcw size={16} />
          Reset
        </button>
        <button onClick={onDelete} disabled={!activePrompt?.id} title="Delete active prompt">
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </section>
  );
}
