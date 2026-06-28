import { Database, ImagePlus, Images, Layers, Mountain, Move, Palette, Sparkles, UserRound, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import {
  type ReferenceDropTarget,
  referenceDropTargets,
  referenceDisplayName,
  referencePreviewSrc,
  referenceRoleConfig,
  referenceToken
} from "@/lib/reference-roles";
import { BFL_IMAGE_OPTION_MIME, BFL_REFERENCE_MIME, parseReferenceDragPayload, setReferenceDragData } from "@/lib/reference-drag";
import type { BatchMode, ReferenceImage, ReferenceRole } from "@/lib/types";
import { estimateMegapixels, modelOptions } from "@/lib/pricing";

const REFERENCE_WEIGHT_STEPS = [
  { label: "Hint", value: 0 },
  { label: "Blend", value: 50 },
  { label: "Strong", value: 80 },
  { label: "Anchor", value: 100 }
];

const roleIcons: Record<ReferenceRole, typeof UserRound> = {
  character: UserRound,
  style: Palette,
  environment: Mountain,
  pose: Move,
  loose: Images
};

type RunPanelProps = {
  model: string;
  width: number;
  height: number;
  seed: string;
  promptUpsampling: boolean;
  batchCount: number;
  batchMode: BatchMode;
  selectedPromptCount: number;
  permutationPairCount: number;
  batchProgress: { current: number; total: number } | null;
  references: ReferenceImage[];
  maxReferences: number;
  primaryReferenceUrl: string;
  primaryReferencePreview?: string;
  referenceWeight: number;
  referenceCue: string;
  promptTokens: number;
  promptTokenLimit?: number;
  estimatedCredits: number;
  estimatedUsd: number;
  costLabel: string;
  isGenerating: boolean;
  error: string;
  onModelChange: (value: string) => void;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onSeedChange: (value: string) => void;
  onPromptUpsamplingChange: (value: boolean) => void;
  onBatchCountChange: (value: number) => void;
  onBatchModeChange: (value: BatchMode) => void;
  onReferencesChange: (value: ReferenceImage[]) => void;
  onPrimaryReferenceUrlChange: (value: string) => void;
  onPrimaryReferenceFiles: (files: File[], role?: ReferenceRole) => void;
  onClearPrimaryReference: () => void;
  onReferenceWeightChange: (value: number) => void;
  onReferenceCueChange: (value: string) => void;
  onReferenceFiles: (files: File[], role?: ReferenceRole, targetId?: string) => void;
  onReferenceDropPayload: (payload: string, role?: ReferenceRole, targetId?: string) => void;
  onGenerate: () => void;
};

export function RunPanel(props: RunPanelProps) {
  const [dragTargetId, setDragTargetId] = useState("");
  const megapixels = estimateMegapixels(props.width, props.height);
  const progressPct = props.batchProgress
    ? Math.max(0, Math.min(100, (props.batchProgress.current / props.batchProgress.total) * 100))
    : 0;
  const referenceWeightIndex = REFERENCE_WEIGHT_STEPS.reduce(
    (nearest, step, index) =>
      Math.abs(step.value - props.referenceWeight) < Math.abs(REFERENCE_WEIGHT_STEPS[nearest].value - props.referenceWeight)
        ? index
        : nearest,
    0
  );
  const referenceWeightLabel = REFERENCE_WEIGHT_STEPS[referenceWeightIndex].label;
  const activeReferenceCount = props.references.filter((reference) => Boolean(reference.value)).length;
  const promptTokenLabel = props.promptTokenLimit
    ? `${props.promptTokens} / ${props.promptTokenLimit.toLocaleString()} tok`
    : `${props.promptTokens} tok`;
  const referencesWithIndex = props.references.map((reference, index) => ({ reference, index }));
  const targetReferences = new Map<string, typeof referencesWithIndex>();
  const seenLegacyTargetsByRole = new Map<ReferenceRole, number>();

  referenceDropTargets.forEach((target) => {
    const explicitReferences = referencesWithIndex.filter(
      ({ reference }) => Boolean(reference.value) && reference.targetId === target.id
    );
    const legacyRoleReferences = referencesWithIndex.filter(
      ({ reference, index }) =>
        Boolean(reference.value) &&
        !reference.targetId &&
        referenceRoleConfig(reference.role, index).id === target.role
    );
    const occurrence = seenLegacyTargetsByRole.get(target.role) || 0;
    seenLegacyTargetsByRole.set(target.role, occurrence + 1);
    const legacyReferences =
      target.role === "style" ? legacyRoleReferences.slice(occurrence, occurrence + 1) : legacyRoleReferences;
    targetReferences.set(target.id, [...explicitReferences, ...legacyReferences]);
  });

  function updateReference(id: string, patch: Partial<ReferenceImage>) {
    props.onReferencesChange(props.references.map((reference) => (reference.id === id ? { ...reference, ...patch } : reference)));
  }

  function removeReference(id: string) {
    props.onReferencesChange(props.references.filter((reference) => reference.id !== id));
  }

  function updateReferenceTarget(id: string, target: ReferenceDropTarget) {
    props.onReferencesChange(
      props.references.map((reference) =>
        reference.id === id ? { ...reference, role: target.role, targetId: target.id } : reference
      )
    );
  }

  function referenceDragClass(targetId: string, hasReferences: boolean) {
    return ["referenceRoleDrop", hasReferences ? "active" : "", dragTargetId === targetId ? "dragOver" : ""]
      .filter(Boolean)
      .join(" ");
  }

  function handleReferenceDragOver(event: ReactDragEvent, targetId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (dragTargetId !== targetId) setDragTargetId(targetId);
  }

  function handleReferenceDragLeave(event: ReactDragEvent, targetId: string) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setDragTargetId((current) => (current === targetId ? "" : current));
  }

  function handleReferenceDrop(event: ReactDragEvent, target?: ReferenceDropTarget) {
    event.preventDefault();
    setDragTargetId("");
    const referencePayload = event.dataTransfer.getData(BFL_REFERENCE_MIME);
    if (referencePayload && target) {
      const draggedReference = parseReferenceDragPayload(referencePayload);
      if (draggedReference?.id && props.references.some((reference) => reference.id === draggedReference.id)) {
        updateReferenceTarget(draggedReference.id, target);
        return;
      }
    }
    const payload =
      event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) ||
      event.dataTransfer.getData("text/plain");
    if (payload.startsWith("asset:")) {
      props.onReferenceDropPayload(payload, target?.role, target?.id);
      return;
    }
    props.onReferenceFiles(
      Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/")),
      target?.role,
      target?.id
    );
  }

  return (
    <aside className="panel controls">
      <PanelHeader title="Run">
        <Sparkles size={18} />
      </PanelHeader>

      <div className="costGrid">
        <MetaBox label="Prompt" value={promptTokenLabel} />
        <MetaBox label="Output" value={`${megapixels.toFixed(2)} MP`} />
        <MetaBox label="Est." value={`${props.estimatedCredits.toFixed(2)} cr`} />
        <MetaBox label="USD" value={`$${props.estimatedUsd.toFixed(3)}`} />
      </div>
      <p className="costNote">{props.costLabel} minimum estimate. Actual cost is logged after submit when BFL returns it.</p>

      <label>
        Model
        <select value={props.model} onChange={(event) => props.onModelChange(event.target.value)}>
          {modelOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="sizeGrid">
        <label>
          Width
          <input type="number" min={64} step={16} value={props.width} onChange={(event) => props.onWidthChange(Number(event.target.value))} />
        </label>
        <label>
          Height
          <input type="number" min={64} step={16} value={props.height} onChange={(event) => props.onHeightChange(Number(event.target.value))} />
        </label>
      </div>

      <label>
        Seed
        <input value={props.seed} onChange={(event) => props.onSeedChange(event.target.value)} placeholder="optional" />
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={props.promptUpsampling}
          onChange={(event) => props.onPromptUpsamplingChange(event.target.checked)}
        />
        <span>Prompt upsampling</span>
      </label>

      <div className="batchBox">
        <div className="batchTitle">
          <Layers size={15} />
          <span>Batch</span>
        </div>
        <div className="sizeGrid">
          <label>
            Count
            <input
              type="number"
              min={1}
              max={300}
              value={props.batchCount}
              onChange={(event) => props.onBatchCountChange(event.currentTarget.valueAsNumber)}
            />
          </label>
          <label>
            Source
            <select value={props.batchMode} onChange={(event) => props.onBatchModeChange(event.target.value as BatchMode)}>
              <option value="current">Current prompt</option>
              <option value="library">Prompt queue</option>
              <option value="permutations" disabled={props.selectedPromptCount < 2}>
                Selected pairs ({props.permutationPairCount})
              </option>
            </select>
          </label>
        </div>
        {props.batchMode === "permutations" && (
          <div className="scriptCounter">
            <strong>{props.permutationPairCount}</strong>
            <span>selected prompt pair{props.permutationPairCount === 1 ? "" : "s"} available</span>
          </div>
        )}
        {props.batchProgress && (
          <div className="progressBox">
            <div className="progressTrack">
              <span style={{ width: `${progressPct}%` }} />
            </div>
            <small>
              {props.batchProgress.current} / {props.batchProgress.total}
            </small>
          </div>
        )}
      </div>

      <div className="referenceHeader">
        <span>References {activeReferenceCount}/{props.maxReferences}</span>
        {(props.primaryReferencePreview || props.primaryReferenceUrl) && (
          <IconButton title="Clear reference" onClick={props.onClearPrimaryReference}>
            <X size={14} />
          </IconButton>
        )}
      </div>

      <div className="referenceRoleGrid">
        {referenceDropTargets.map((target) => (
          (() => {
            const role = referenceRoleConfig(target.role);
            const references = targetReferences.get(target.id) || [];
            const RoleIcon = roleIcons[target.role];
            return (
              <div
                className={referenceDragClass(target.id, Boolean(references.length))}
                key={target.id}
                onDragOver={(event) => handleReferenceDragOver(event, target.id)}
                onDragLeave={(event) => handleReferenceDragLeave(event, target.id)}
                onDrop={(event) => handleReferenceDrop(event, target)}
                title={role.cue}
              >
                <div className="referenceRoleTitle">
                  <span>
                    <RoleIcon size={14} />
                    <strong>{target.label}</strong>
                  </span>
                </div>
                <div className="referenceRoleMeta">
                  <small>{target.hint}</small>
                  <code>{target.token}</code>
                </div>
                <div className={references.length ? "referenceRoleThumbs" : "referenceRoleThumbs empty"}>
                  {references.length ? (
                    references.slice(0, 4).map(({ reference, index }) => {
                      const preview = referencePreviewSrc(reference);
                      return (
                        <div className="referenceRoleThumb" key={reference.id}>
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview}
                              alt={referenceDisplayName(reference, index)}
                              draggable
                              onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}
                            />
                          ) : (
                            <span
                              draggable
                              onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, index)}
                            >
                              {referenceToken(index)}
                            </span>
                          )}
                          <button
                            type="button"
                            className="referenceThumbRemove"
                            title={`Remove ${referenceToken(index)}`}
                            onClick={() => removeReference(reference.id)}
                          >
                            <X size={12} />
                          </button>
                          <em>{referenceToken(index)}</em>
                        </div>
                      );
                    })
                  ) : (
                    <span className="referenceRoleEmpty">{target.emptyLabel}</span>
                  )}
                </div>
              </div>
            );
          })()
        ))}
      </div>

      <div
        className={dragTargetId === "all" ? "referenceDropzone dragOver" : "referenceDropzone"}
        onDragOver={(event) => handleReferenceDragOver(event, "all")}
        onDragLeave={(event) => handleReferenceDragLeave(event, "all")}
        onDrop={(event) => handleReferenceDrop(event)}
      >
        <Database size={15} />
        <span>Drop gallery cards or image files here for the next open reference slot</span>
      </div>

      <div
        className="referenceUrlBar"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragTargetId("");
          props.onPrimaryReferenceFiles(Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/")));
        }}
      >
        {props.primaryReferencePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.primaryReferencePreview}
            alt="Primary reference"
            draggable={Boolean(props.references[0])}
            onDragStart={(event) => props.references[0] && setReferenceDragData(event.dataTransfer, props.references[0], 0)}
          />
        ) : (
          <ImagePlus size={16} />
        )}
        <input
          value={props.primaryReferenceUrl}
          onChange={(event) => props.onPrimaryReferenceUrlChange(event.target.value)}
          placeholder="Reference image URL"
        />
        {props.references[0] && (
          <button type="button" className="referenceUrlClear" title="Remove primary reference" onClick={props.onClearPrimaryReference}>
            <X size={14} />
          </button>
        )}
      </div>

      <div className="referenceWeightControl">
        <div>
          <span>Reference influence</span>
          <strong>{referenceWeightLabel} · {props.referenceWeight}</strong>
        </div>
        <input
          type="range"
          min={0}
          max={REFERENCE_WEIGHT_STEPS.length - 1}
          step={1}
          value={referenceWeightIndex}
          onChange={(event) =>
            props.onReferenceWeightChange(REFERENCE_WEIGHT_STEPS[Number(event.currentTarget.value)].value)
          }
        />
        <div className="referenceWeightTicks">
          {REFERENCE_WEIGHT_STEPS.map((step) => (
            <button
              type="button"
              key={step.label}
              className={step.value === props.referenceWeight ? "active" : ""}
              onClick={() => props.onReferenceWeightChange(step.value)}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      <div className="referenceList">
        {props.references.slice(1).map((reference, index) => {
          const slotIndex = index + 1;
          const role = referenceRoleConfig(reference.role, slotIndex);
          const preview = referencePreviewSrc(reference);
          return (
            <div className="referenceItem" key={reference.id}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt={referenceDisplayName(reference, slotIndex)}
                  draggable
                  onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, slotIndex)}
                />
              ) : (
                <div
                  className="referenceIndex"
                  draggable
                  onDragStart={(event) => setReferenceDragData(event.dataTransfer, reference, slotIndex)}
                >
                  {slotIndex + 1}
                </div>
              )}
              <div className="referenceItemMeta">
                <strong>{referenceToken(slotIndex)}</strong>
                <span>{role.label}</span>
              </div>
              <input
                value={reference.value}
                placeholder={`Image ${slotIndex + 1} URL or data URL`}
                onChange={(event) => updateReference(reference.id, { value: event.target.value })}
              />
              <button
                type="button"
                title="Remove reference"
                onClick={() => removeReference(reference.id)}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <textarea
        className="referenceCue"
        value={props.referenceCue}
        onChange={(event) => props.onReferenceCueChange(event.target.value)}
      />

      <RunButton isRunning={props.isGenerating} onClick={() => props.onGenerate()}>
        {props.isGenerating
          ? props.batchProgress
            ? `Running ${props.batchProgress.current}/${props.batchProgress.total}`
            : "Generating"
          : props.batchCount > 1
            ? "Generate Batch"
            : "Generate"}
      </RunButton>
      {props.error && <p className="errorText">{props.error}</p>}
    </aside>
  );
}
