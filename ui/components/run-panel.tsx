import { Database, ImagePlus, Layers, Sparkles, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import type { BatchMode, ReferenceImage } from "@/lib/types";
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
  onPrimaryReferenceFiles: (files: File[]) => void;
  onClearPrimaryReference: () => void;
  onReferenceWeightChange: (value: number) => void;
  onReferenceCueChange: (value: string) => void;
  onReferenceFiles: (files: File[]) => void;
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

      <div
        className="referenceDropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          props.onReferenceFiles(Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/")));
        }}
      >
        <Database size={15} />
        <span>Drop images here, or paste hosted URLs below</span>
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
        {props.references.slice(1).map((reference, index) => (
          <div className="referenceItem" key={reference.id}>
            {reference.value.startsWith("data:") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reference.value} alt={reference.name} />
            ) : (
              <div className="referenceIndex">{index + 2}</div>
            )}
            <input
              value={reference.value}
              placeholder={`Image ${index + 2} URL or data URL`}
              onChange={(event) =>
                props.onReferencesChange(
                  props.references.map((item) =>
                    item.id === reference.id ? { ...item, value: event.target.value } : item
                  )
                )
              }
            />
            <button
              title="Remove reference"
              onClick={() => props.onReferencesChange(props.references.filter((item) => item.id !== reference.id))}
            >
              x
            </button>
          </div>
        ))}
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
