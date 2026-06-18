import { Database, ImagePlus, Layers, Sparkles, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import {
  referenceDisplayName,
  referencePreviewSrc,
  referenceRoleConfig,
  referenceRoleOptions,
  referenceRoleToken,
  referenceToken
} from "@/lib/reference-roles";
import type { AssetRecord, BatchMode, ReferenceImage, ReferenceRole } from "@/lib/types";
import { estimateMegapixels, modelOptions } from "@/lib/pricing";

const REFERENCE_WEIGHT_STEPS = [
  { label: "Hint", value: 0 },
  { label: "Blend", value: 50 },
  { label: "Strong", value: 80 },
  { label: "Anchor", value: 100 }
];

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
  assets: AssetRecord[];
  references: ReferenceImage[];
  primaryReferenceUrl: string;
  primaryReferencePreview?: string;
  referenceWeight: number;
  referenceCue: string;
  promptTokens: number;
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
  onReferenceFiles: (files: File[], role?: ReferenceRole) => void;
  onReferenceDropPayload: (payload: string, role?: ReferenceRole) => void;
  onReferenceAssetSelect: (assetId: string, role?: ReferenceRole) => void;
  onGenerate: () => void;
};

export function RunPanel(props: RunPanelProps) {
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
  const galleryAssets = props.assets || [];
  const primaryRole = referenceRoleConfig(props.references[0]?.role, 0);
  const referencesWithIndex = props.references.map((reference, index) => ({ reference, index }));
  const referencedAssetSlots = new Map(
    referencesWithIndex
      .filter(({ reference }) => reference.assetId)
      .map(({ reference, index }) => [reference.assetId, `${referenceToken(index)} ${referenceRoleConfig(reference.role, index).shortLabel}`])
  );
  const activeReferencesByRole = referenceRoleOptions.map((role) => ({
    role,
    references: referencesWithIndex.filter(
      ({ reference, index }) => Boolean(reference.value) && referenceRoleConfig(reference.role, index).id === role.id
    )
  }));

  function updateReference(id: string, patch: Partial<ReferenceImage>) {
    props.onReferencesChange(props.references.map((reference) => (reference.id === id ? { ...reference, ...patch } : reference)));
  }

  function handleReferenceDrop(event: React.DragEvent, role?: ReferenceRole) {
    event.preventDefault();
    const payload =
      event.dataTransfer.getData("application/x-bfl-image-option") ||
      event.dataTransfer.getData("text/plain");
    if (payload.startsWith("asset:")) {
      props.onReferenceDropPayload(payload, role);
      return;
    }
    props.onReferenceFiles(Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/")), role);
  }

  return (
    <aside className="panel controls">
      <PanelHeader title="Run">
        <Sparkles size={18} />
      </PanelHeader>

      <div className="costGrid">
        <MetaBox label="Prompt" value={`${props.promptTokens} tok`} />
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
        <span>References</span>
        {(props.primaryReferencePreview || props.primaryReferenceUrl) && (
          <IconButton title="Clear reference" onClick={props.onClearPrimaryReference}>
            <X size={14} />
          </IconButton>
        )}
      </div>

      <div className="referenceRoleGrid">
        {activeReferencesByRole.map(({ role, references }) => (
          <div
            className={references.length ? "referenceRoleDrop active" : "referenceRoleDrop"}
            key={role.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleReferenceDrop(event, role.id)}
            title={role.cue}
          >
            <div>
              <strong>
                {role.label}
                <code>{referenceRoleToken(role.id)}</code>
              </strong>
              <small>{role.hint}</small>
            </div>
            <select
              className="referenceRoleAssetSelect"
              value=""
              disabled={!galleryAssets.length}
              aria-label={`Add ${role.label} reference from gallery`}
              onChange={(event) => {
                const assetId = event.currentTarget.value;
                if (assetId) props.onReferenceAssetSelect(assetId, role.id);
              }}
            >
              <option value="">{galleryAssets.length ? "Add from gallery" : "No gallery images"}</option>
              {galleryAssets.map((asset) => {
                const slot = referencedAssetSlots.get(asset.id);
                return (
                  <option key={asset.id} value={asset.id}>
                    {asset.title || asset.id}{slot ? ` (${slot})` : ""}
                  </option>
                );
              })}
            </select>
            <div className="referenceRoleThumbs">
              {references.length ? (
                references.slice(0, 3).map(({ reference, index }) => {
                  const preview = referencePreviewSrc(reference);
                  return preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={reference.id} src={preview} alt={referenceDisplayName(reference, index)} />
                  ) : (
                    <span key={reference.id}>{referenceToken(index)}</span>
                  );
                })
              ) : (
                <span>Drop</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        className="referenceDropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleReferenceDrop(event)}
      >
        <Database size={15} />
        <span>Drop gallery cards or image files here, or paste hosted URLs below</span>
      </div>

      <div
        className="referenceUrlBar"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          props.onPrimaryReferenceFiles(Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/")));
        }}
      >
        {props.primaryReferencePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.primaryReferencePreview} alt="Primary reference" />
        ) : (
          <ImagePlus size={16} />
        )}
        <input
          value={props.primaryReferenceUrl}
          onChange={(event) => props.onPrimaryReferenceUrlChange(event.target.value)}
          placeholder="Reference image URL"
        />
        <select
          value={primaryRole.id}
          disabled={!props.references[0]}
          onChange={(event) => {
            if (props.references[0]) updateReference(props.references[0].id, { role: event.target.value as ReferenceRole });
          }}
          aria-label="Primary reference role"
        >
          {referenceRoleOptions.map((role) => (
            <option key={role.id} value={role.id}>
              {role.label}
            </option>
          ))}
        </select>
      </div>

      <div className="referenceWeightControl">
        <div>
          <span>Reference weight</span>
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
                <img src={preview} alt={referenceDisplayName(reference, slotIndex)} />
              ) : (
                <div className="referenceIndex">{slotIndex + 1}</div>
              )}
              <select
                value={role.id}
                aria-label={`${referenceToken(slotIndex)} role`}
                onChange={(event) => updateReference(reference.id, { role: event.target.value as ReferenceRole })}
              >
                {referenceRoleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={reference.value}
                placeholder={`Image ${slotIndex + 1} URL or data URL`}
                onChange={(event) => updateReference(reference.id, { value: event.target.value })}
              />
              <button
                title="Remove reference"
                onClick={() => props.onReferencesChange(props.references.filter((item) => item.id !== reference.id))}
              >
                x
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
