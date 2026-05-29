import { ChangeEvent } from "react";
import { Database, ImagePlus, Layers, LoaderCircle, Play, Sparkles, Upload } from "lucide-react";
import type { BatchMode, ReferenceImage } from "@/lib/types";
import { estimateMegapixels, modelOptions } from "@/lib/pricing";

type RunPanelProps = {
  model: string;
  width: number;
  height: number;
  seed: string;
  promptUpsampling: boolean;
  batchCount: number;
  batchMode: BatchMode;
  selectedPromptCount: number;
  batchProgress: { current: number; total: number } | null;
  references: ReferenceImage[];
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
  onReferenceCueChange: (value: string) => void;
  onReferenceUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onReferenceFiles: (files: File[]) => void;
  onAddReferenceUrl: () => void;
  onGenerate: () => void;
};

export function RunPanel(props: RunPanelProps) {
  const megapixels = estimateMegapixels(props.width, props.height);
  const progressPct = props.batchProgress
    ? Math.max(0, Math.min(100, (props.batchProgress.current / props.batchProgress.total) * 100))
    : 0;

  return (
    <aside className="panel controls">
      <div className="panelHeader">
        <h2>Run</h2>
        <Sparkles size={18} />
      </div>

      <div className="costGrid">
        <div>
          <span>Prompt</span>
          <strong>{props.promptTokens} tok</strong>
        </div>
        <div>
          <span>Output</span>
          <strong>{megapixels.toFixed(2)} MP</strong>
        </div>
        <div>
          <span>Est.</span>
          <strong>{props.estimatedCredits.toFixed(2)} cr</strong>
        </div>
        <div>
          <span>USD</span>
          <strong>${props.estimatedUsd.toFixed(3)}</strong>
        </div>
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
              max={50}
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
                Selected permutations ({props.selectedPromptCount})
              </option>
            </select>
          </label>
        </div>
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
        <div>
          <label className="iconButton fileButton" title="Upload references">
            <ImagePlus size={16} />
            <input type="file" accept="image/*" multiple onChange={props.onReferenceUpload} />
          </label>
          <button className="iconButton" title="Add reference URL" onClick={props.onAddReferenceUrl}>
            <Upload size={16} />
          </button>
        </div>
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

      <div className="referenceList">
        {props.references.map((reference, index) => (
          <div className="referenceItem" key={reference.id}>
            {reference.value.startsWith("data:") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reference.value} alt={reference.name} />
            ) : (
              <div className="referenceIndex">{index + 1}</div>
            )}
            <input
              value={reference.value}
              placeholder={`Image ${index + 1} URL or data URL`}
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

      <button className="generateButton" onClick={props.onGenerate} disabled={props.isGenerating}>
        {props.isGenerating ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
        {props.isGenerating
          ? props.batchProgress
            ? `Running ${props.batchProgress.current}/${props.batchProgress.total}`
            : "Generating"
          : props.batchCount > 1
            ? "Generate Batch"
            : "Generate"}
      </button>
      {props.error && <p className="errorText">{props.error}</p>}
    </aside>
  );
}
