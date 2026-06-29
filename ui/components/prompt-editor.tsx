import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { Clipboard, MapPin, RotateCcw, Save, SaveAll, Trash2, Upload, Wand2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { PanelHeader } from "@/components/ui/panel-header";
import {
  referenceDisplayName,
  referencePreviewSrc,
  referenceRoleConfig,
  referenceTargetToken,
  referenceToken
} from "@/lib/reference-roles";
import { BFL_IMAGE_OPTION_MIME, setReferenceDragData } from "@/lib/reference-drag";
import type { AssetRecord, PromptRecord, ReferenceImage } from "@/lib/types";
import { comboEnvironmentLabel, promptHeaderSummary, type ComboEnvironmentOption } from "@/lib/prompt-combo";
import { applyEnvironmentToPrompt, applyPresetToPrompt, compactPrompt, presets } from "@/lib/prompt-utils";

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
  submittedPrompt: string;
  promptSourceAsset?: AssetRecord | null;
  environmentOptions: ComboEnvironmentOption[];
  activeEnvironment: string;
  onEnvironmentSelect: (environment: string) => void;
  onReferenceDropPayload: (payload: string) => number | null | void;
  onReferenceFiles: (files: File[]) => Promise<number[]>;
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
  submittedPrompt,
  promptSourceAsset,
  environmentOptions,
  activeEnvironment,
  onEnvironmentSelect,
  onReferenceDropPayload,
  onReferenceFiles
}: PromptEditorProps) {
  const [activePresetId, setActivePresetId] = useState("");
  const [appliedEnvironmentId, setAppliedEnvironmentId] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeReferences = references
    .map((reference, index) => ({ reference, index }))
    .filter(({ reference }) => Boolean(reference.value));

  // Clear the "plugged in" indicators when a different prompt is loaded.
  useEffect(() => {
    setActivePresetId("");
    setAppliedEnvironmentId("");
  }, [activePrompt?.id]);

  // Compact header summary: combo / prompt base plus any look + environment applied this session.
  const appliedEnvironment = environmentOptions.find((environment) => environment.id === appliedEnvironmentId);
  const headerSummary = promptHeaderSummary({
    fallbackId: activePrompt?.id,
    combo: activePrompt?.combo,
    lightingLabel: presets.find((preset) => preset.id === activePresetId)?.label,
    environmentLabel: appliedEnvironment ? comboEnvironmentLabel(appliedEnvironment) : undefined
  });

  function applyPreset(preset: (typeof presets)[number]) {
    onPromptChange(applyPresetToPrompt(promptText, preset));
    setActivePresetId(preset.id);
  }

  function applyEnvironment(environment: ComboEnvironmentOption) {
    onPromptChange(applyEnvironmentToPrompt(promptText, environment.description));
    onEnvironmentSelect(environment.id);
    setAppliedEnvironmentId(environment.id);
  }

  function editPrompt(value: string) {
    if (activePresetId) setActivePresetId("");
    onPromptChange(value);
  }

  function insertImageTokens(slots: number[]) {
    if (!slots.length) return;
    insertPromptToken(slots.map((slot) => `@img${slot}`).join(" "));
  }

  function insertPromptToken(tokens: string) {
    if (!tokens.trim()) return;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? promptText.length;
    const end = textarea?.selectionEnd ?? start;
    const before = promptText.slice(0, start);
    const after = promptText.slice(end);
    const prefix = before && !/\s$/.test(before) ? " " : "";
    const suffix = after && !/^\s/.test(after) ? " " : "";
    const nextValue = `${before}${prefix}${tokens.trim()}${suffix}${after}`;
    editPrompt(nextValue);
    window.setTimeout(() => {
      const cursor = start + prefix.length + tokens.trim().length;
      textarea?.focus();
      textarea?.setSelectionRange(cursor, cursor);
    }, 0);
  }

  async function handleReferenceDrop(event: ReactDragEvent) {
    const payload =
      event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) ||
      event.dataTransfer.getData("text/plain");
    if (payload.startsWith("asset:")) {
      event.preventDefault();
      const slot = onReferenceDropPayload(payload);
      if (slot) insertImageTokens([slot]);
      return;
    }
    const imageFiles = Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    event.preventDefault();
    const slots = await onReferenceFiles(imageFiles);
    insertImageTokens(slots);
  }

  return (
    <section
      className="panel editor"
      onDragOver={(event) => {
        const types = Array.from(event.dataTransfer.types);
        if (types.includes(BFL_IMAGE_OPTION_MIME) || types.includes("Files")) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => void handleReferenceDrop(event)}
    >
      <PanelHeader
        title={<span className="promptHeaderTitle" title={headerSummary}>{headerSummary}</span>}
        subtitle={activePrompt?.plant_form || "Structured FLUX.2 prompt"}
      >
        <div className="presetRow" role="group" aria-label="Look presets">
          <div className="presetGroup" role="radiogroup" aria-label="Lighting style">
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
          <div className="presetGroup environmentPresetGroup" role="radiogroup" aria-label="Environment">
            {environmentOptions.map((environment) => {
              const active = environment.id === activeEnvironment;
              return (
                <button
                  key={environment.id}
                  className={active ? "presetToggle active" : "presetToggle"}
                  aria-pressed={active}
                  title={environment.description}
                  onClick={() => applyEnvironment(environment)}
                >
                  <MapPin size={15} />
                  {comboEnvironmentLabel(environment)}
                </button>
              );
            })}
          </div>
        </div>
      </PanelHeader>

      <textarea
        ref={textareaRef}
        className="promptEditor"
        value={promptText}
        onChange={(event) => editPrompt(event.target.value)}
        onDrop={(event) => void handleReferenceDrop(event)}
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
                {activeReferences.map(({ reference, index }) => {
                  const role = referenceRoleConfig(reference.role, index);
                  const preview = referencePreviewSrc(reference);
                  const token = referenceToken(index);
                  const roleToken = referenceTargetToken(reference, index);
                  return (
                    <button
                      type="button"
                      key={reference.id}
                      className="promptReferenceChip"
                      title={`Insert ${roleToken} (${token})`}
                      draggable
                      onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}
                      onClick={() => insertPromptToken(roleToken)}
                    >
                      {preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="" />
                      ) : (
                        <i>{index + 1}</i>
                      )}
                      <b>{roleToken}</b>
                      <em>{token}</em>
                      <span>{referenceDisplayName(reference, index)}</span>
                    </button>
                  );
                })}
              </div>
              <p>{submittedReferenceCue}</p>
              <div className="submittedPromptBox">
                <div>
                  <strong>Submitted prompt</strong>
                  <button type="button" onClick={() => void copyText(submittedPrompt)}>
                    <Clipboard size={14} />
                    Copy
                  </button>
                </div>
                <textarea value={submittedPrompt} readOnly spellCheck={false} />
              </div>
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
