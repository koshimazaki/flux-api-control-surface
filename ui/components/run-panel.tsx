import { Layers, Sparkles } from "lucide-react";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import { JobQueue, type JobQueueControls } from "@/components/ui/job-queue";
import { SeedControl } from "@/components/seed-control";
import type { BatchMode } from "@/lib/types";
import { estimateMegapixels, modelOptions } from "@/lib/pricing";
import type { GenerationQueueJob, GenerationQueueSummary } from "@/lib/generation-queue";

type RunPanelProps = {
  model: string;
  width: number;
  height: number;
  seed: string;
  seedLocked: boolean;
  promptUpsampling: boolean;
  normalizeReferences: boolean;
  batchCount: number;
  batchMode: BatchMode;
  selectedPromptCount: number;
  permutationPairCount: number;
  batchProgress: { current: number; total: number } | null;
  promptTokens: number;
  promptTokenLimit?: number;
  estimatedCredits: number;
  estimatedUsd: number;
  costLabel: string;
  isGenerating: boolean;
  generationQueue: GenerationQueueJob[];
  generationQueueSummary: GenerationQueueSummary;
  generationQueueConcurrency: number;
  generationQueueControls?: JobQueueControls;
  error: string;
  onModelChange: (value: string) => void;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onSeedChange: (value: string) => void;
  onSeedLockedChange: (value: boolean) => void;
  onRandomSeed: () => void;
  onPromptUpsamplingChange: (value: boolean) => void;
  onNormalizeReferencesChange: (value: boolean) => void;
  onBatchCountChange: (value: number) => void;
  onBatchModeChange: (value: BatchMode) => void;
  onGenerate: () => void;
};

export function RunPanel(props: RunPanelProps) {
  const megapixels = estimateMegapixels(props.width, props.height);
  const progressPct = props.batchProgress
    ? Math.max(0, Math.min(100, (props.batchProgress.current / props.batchProgress.total) * 100))
    : 0;
  const promptTokenLabel = props.promptTokenLimit
    ? `${props.promptTokens} / ${props.promptTokenLimit.toLocaleString()} tok`
    : `${props.promptTokens} tok`;
  const generateLabel = props.isGenerating
    ? props.batchCount > 1
      ? "Queue Batch"
      : "Queue Next"
    : props.batchCount > 1
      ? "Generate Batch"
      : "Generate";
  return (
    <aside className="panel controls">
      <PanelHeader title="Generate" subtitle="RUN · image request">
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

      <SeedControl
        value={props.seed}
        locked={props.seedLocked}
        onChange={props.onSeedChange}
        onLockedChange={props.onSeedLockedChange}
        onRandomize={props.onRandomSeed}
      />

      <JobQueue
        queue={props.generationQueue}
        summary={props.generationQueueSummary}
        concurrency={props.generationQueueConcurrency}
        controls={props.generationQueueControls}
      />

      <RunButton isRunning={props.isGenerating} onClick={() => props.onGenerate()} disableWhenRunning={false}>
        {generateLabel}
      </RunButton>
      {props.error && <p className="errorText">{props.error}</p>}
    </aside>
  );
}
