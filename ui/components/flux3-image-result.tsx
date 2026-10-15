import { Expand, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { WaitField } from "@/components/ui/wait-field";
import { assetImageSource } from "@/lib/dashboard-tools";
import { flux3ImageStatusLabels, type Flux3ImageRunView } from "@/lib/dashboard/use-flux3-image-run";
import type { AssetRecord } from "@/lib/types";

type Flux3ImageResultProps = {
  /** At least one job is queued or running. */
  running: boolean;
  run: Flux3ImageRunView;
  onOpen: (asset: AssetRecord) => void;
  onEdit: (asset: AssetRecord) => void;
  /** Closes the layer; running jobs carry on in the queue. */
  onDismiss: () => void;
};

/**
 * The runs and their latest result, over the FLUX 3 Image stage. While a job
 * runs with nothing to show yet, the waiting field covers the stage; when an
 * image has decoded the field clears over it in the order of its own light,
 * as in FLUX Studio Lite. A result that was already there when the stage
 * opened is shown without the reveal. With more jobs queued, each new result
 * arrives the same way.
 */
export function Flux3ImageResult({ running, run, onOpen, onEdit, onDismiss }: Flux3ImageResultProps) {
  const { result } = run;
  const [decodedId, setDecodedId] = useState<string | null>(null);
  // Results revealed already; one present at mount counts as revealed.
  const [revealedId, setRevealedId] = useState<string | null>(result?.id ?? null);
  const [now, setNow] = useState(() => Date.now());
  const waiting = running && !result;

  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  if (!running && !result) return null;
  const covered = waiting || Boolean(result && revealedId !== result.id);
  const title = result?.title || result?.id || "";
  const others = result ? run.count : run.count - 1;

  return (
    <div className={waiting ? "flux3ImageResult waiting" : "flux3ImageResult"}>
      {result && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={result.id}
          src={assetImageSource(result)}
          alt={title}
          draggable={false}
          onClick={() => onOpen(result)}
          // The reveal waits for the picture; one that cannot load still lifts the field.
          onLoad={() => setDecodedId(result.id)}
          onError={() => setDecodedId(result.id)}
        />
      )}
      {covered && <WaitField active={waiting || decodedId !== result?.id} onDone={() => setRevealedId(result?.id ?? null)} />}
      {waiting && (
        <>
          <div className="flux3ImageResultStatus" role="status">
            <strong>{flux3ImageStatusLabels[run.status] || "Generating"}</strong>
            <span>
              {run.startedAt ? `${Math.max(0, Math.floor((now - run.startedAt) / 1000))}s · ` : ""}
              {others > 0 ? `${others} more in the queue · ` : ""}
              keeps running if you reload
            </span>
          </div>
          <div className="flux3ImageResultActions">
            <button type="button" onClick={onDismiss} title="Hide this and go back to the stage; the job keeps running">
              <X size={14} />
            </button>
          </div>
        </>
      )}
      {result && !covered && (
        <div className="flux3ImageResultActions">
          <button type="button" onClick={() => onEdit(result)} title="Use this result as the source of an edit">
            <WandSparkles size={14} />
            Edit this
          </button>
          <button type="button" onClick={() => onOpen(result)} title="Open full size">
            <Expand size={14} />
          </button>
          <button type="button" onClick={onDismiss} title="Close the result and go back to the stage">
            <X size={14} />
          </button>
          <span>
            {others > 0 ? `${others} more running · ` : ""}
            {title}
          </span>
        </div>
      )}
    </div>
  );
}
