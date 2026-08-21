import { AlertTriangle, Info, Play, Shield } from "lucide-react";
import { MetaBox } from "@/components/ui/meta-box";
import { NumberField } from "@/components/ui/number-field";
import type { VideoScriptPlan } from "@/lib/video-script-plan";

/**
 * Live batch preview: raw expansion → unique rows after dedupe → capped jobs →
 * estimated cost, straight from the planner so the numbers cannot drift from
 * what would be enqueued. Validation errors are listed per row, and the hard
 * cap is the guardrail in front of paid execution.
 */
export type VideoScriptPlanPreviewProps = {
  plan: VideoScriptPlan;
  hardCap: number;
  seed: number;
  isEnqueueing: boolean;
  notice?: string;
  error?: string;
  onHardCapChange: (hardCap: number) => void;
  onSeedChange: (seed: number) => void;
  onEnqueue: () => void;
};

export function VideoScriptPlanPreview(props: VideoScriptPlanPreviewProps) {
  const { preview, rows, warnings } = props.plan;
  const invalidRows = rows.filter((row) => row.errors.length);
  const canEnqueue = preview.validRowCount > 0 && !props.isEnqueueing;

  return (
    <aside className="scriptPlanPanel videoScriptPreview">
      <div className="scriptPlanHero">
        <Play size={18} />
        <span>Video batch</span>
        <strong>{preview.validRowCount}</strong>
        <small>${preview.estimatedTotalUsd.toFixed(2)} estimated at current preview pricing</small>
      </div>

      <div className="videoScriptChain">
        <MetaBox label="Raw" value={preview.rawRowCount} />
        <MetaBox label="Unique" value={preview.uniqueRowCount} />
        <MetaBox label="After prompts" value={preview.promptExpandedRowCount} />
        <MetaBox label="Capped" value={preview.cappedRowCount} />
      </div>
      <p className="videoScriptEquation">{preview.equation}</p>

      <div className="videoScriptGuardrail">
        <label>
          <span>
            <Shield size={12} /> Hard cap
          </span>
          <NumberField min={1} value={props.hardCap} onCommit={props.onHardCapChange} />
        </label>
        <label>
          <span>Planner seed</span>
          <NumberField value={props.seed} onCommit={props.onSeedChange} />
        </label>
      </div>
      <small className="videoScriptSeedNote">
        <Info size={11} />
        The planner seed makes row and prompt selection repeatable. FLUX 3 exposes no generation seed, so the same seed
        will not reproduce identical renders — enhance a saved draft for that.
      </small>

      {warnings.length > 0 && (
        <ul className="videoScriptWarnings">
          {warnings.map((warning) => (
            <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      )}

      {invalidRows.length > 0 && (
        <div className="videoScriptInvalid">
          <div className="runLogHeader">
            <span>Rows to fix</span>
            <small>{invalidRows.length} blocked</small>
          </div>
          {invalidRows.every((row) => row.errors.every((error) => error.code === "prompt_missing")) ? (
            <p className="videoScriptPromptCta">
              <AlertTriangle size={12} />
              No prompt yet. Pick a prompt type or load one from the library in the prompt field
              below the matrix — that unblocks all {invalidRows.length} row
              {invalidRows.length === 1 ? "" : "s"} at once.
            </p>
          ) : invalidRows.every((row) => row.errors.every((error) => error.code === "prompt_placeholders")) ? (
            <p className="videoScriptPromptCta">
              <AlertTriangle size={12} />
              The prompt still has unfilled {"{blanks}"}. Complete them in the prompt field before
              this batch can run — an unfilled blank would be sent to the provider verbatim.
            </p>
          ) : (
          <ul>
            {invalidRows.slice(0, 8).map((row) => (
              <li key={row.id}>
                <AlertTriangle size={11} />
                <strong>{row.id}</strong>
                <span>{row.errors.map((error) => error.message).join(" ")}</span>
              </li>
            ))}
          </ul>
          )}
          {invalidRows.length > 8 && <small>+{invalidRows.length - 8} more</small>}
        </div>
      )}

      {props.error && <p className="videoScriptError">{props.error}</p>}
      {props.notice && <p className="videoScriptNotice">{props.notice}</p>}

      <button type="button" className="videoScriptEnqueue" onClick={props.onEnqueue} disabled={!canEnqueue}>
        <Play size={14} />
        {props.isEnqueueing ? "Queueing" : `Queue ${preview.validRowCount} video ${preview.validRowCount === 1 ? "job" : "jobs"}`}
      </button>
    </aside>
  );
}
