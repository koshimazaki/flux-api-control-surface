import { Download, RotateCcw } from "lucide-react";
import type { RunLogEntry } from "@/lib/types";

type GenerationLogProps = {
  entries: RunLogEntry[];
  onClear: () => void;
  onExport: () => void;
};

function formatDuration(durationMs?: number) {
  if (!durationMs) return "";
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}

function formatBalanceDelta(entry: RunLogEntry) {
  const before = entry.creditsBefore?.toFixed(2) ?? "-";
  const after = entry.creditsAfter?.toFixed(2) ?? "-";
  return `balance ${before} to ${after} (${entry.creditDelta?.toFixed(2)} cr)`;
}

export function GenerationLog({ entries, onClear, onExport }: GenerationLogProps) {
  return (
    <section className="assetsPanel">
      <div className="panelHeader">
        <div>
          <h2>Run Log</h2>
          <p>{entries.length} API calls</p>
        </div>
        <div className="assetActions">
          <button onClick={onExport}>
            <Download size={16} />
            Export
          </button>
          <button onClick={onClear}>
            <RotateCcw size={16} />
            Clear
          </button>
        </div>
      </div>

      <div className="runLogList">
        {entries.slice(0, 80).map((entry) => (
          <div className={entry.status === "failed" ? "runLogItem failed" : "runLogItem"} key={entry.id}>
            <div className="runLogTopline">
              <strong>{entry.title}</strong>
              <small>{new Date(entry.timestamp).toLocaleString()}</small>
            </div>
            <span>
              {entry.model} | {entry.width || "-"}x{entry.height || "-"} | {entry.promptTokens} tok |{" "}
              {typeof entry.actualCredits === "number"
                ? `${entry.actualCredits.toFixed(2)} cr actual`
                : `${entry.estimatedCredits.toFixed(2)} cr est.`}
              {entry.durationMs ? ` | ${formatDuration(entry.durationMs)}` : ""}
            </span>
            {entry.batchTotal && (
              <small>
                batch {entry.batchIndex} / {entry.batchTotal}
              </small>
            )}
            {typeof entry.creditDelta === "number" && (
              <small>{formatBalanceDelta(entry)}</small>
            )}
            {entry.prompt && <pre>{entry.prompt}</pre>}
            {entry.error && <small>{entry.error}</small>}
          </div>
        ))}
        {!entries.length && <div className="runLogEmpty">No calls yet.</div>}
      </div>
    </section>
  );
}
