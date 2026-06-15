import { useEffect, useState } from "react";
import { Clipboard, RotateCcw, Save, SaveAll, Trash2, Upload, Wand2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { PanelHeader } from "@/components/ui/panel-header";
import type { AssetRecord, PromptRecord, ReferenceImage } from "@/lib/types";
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
  references: ReferenceImage[];
  submittedReferenceCue: string;
  promptSourceAsset?: AssetRecord | null;
  onReferenceDropPayload: (payload: string) => void;
};

export function PromptEditor({
  activePrompt,
  promptText,
  onPromptChange,
  onImport,
  onSave,
  onSaveAsNew,
  onDelete,
  onReset,
  references,
  submittedReferenceCue,
  promptSourceAsset,
  onReferenceDropPayload
}: PromptEditorProps) {
  const [activePresetId, setActivePresetId] = useState("");
  const activeReferences = references.filter((reference) => Boolean(reference.value));

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

  function handleAssetDrop(event: React.DragEvent) {
    const payload =
      event.dataTransfer.getData("application/x-bfl-image-option") ||
      event.dataTransfer.getData("text/plain");
    if (!payload.startsWith("asset:")) return;
    event.preventDefault();
    onReferenceDropPayload(payload);
  }

  return (
    <section
      className="panel editor"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("application/x-bfl-image-option")) {
          event.preventDefault();
        }
      }}
      onDrop={handleAssetDrop}
    >
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
        onDrop={handleAssetDrop}
        spellCheck={false}
      />

      {(promptSourceAsset || activeReferences.length > 0) && (
        <div className="promptReferenceStrip">
          {promptSourceAsset && (
            <div className="promptSourceNotice">
              <strong>Prompt source</strong>
              <span>{promptSourceAsset.title || promptSourceAsset.id}</span>
            </div>
          )}
          {activeReferences.length > 0 && (
            <>
              <div className="promptReferenceHeader">
                <strong>Submitted with references</strong>
                <span>{activeReferences.length} image{activeReferences.length === 1 ? "" : "s"}</span>
              </div>
              <div className="promptReferenceChips">
                {activeReferences.map((reference, index) => (
                  <span key={reference.id}>
                    <b>@img{index + 1}</b>
                    {reference.name}
                  </span>
                ))}
              </div>
              <p>{submittedReferenceCue}</p>
            </>
          )}
        </div>
      )}

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
