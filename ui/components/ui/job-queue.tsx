import {
  generationJobKindLabel,
  generationQueueStatusLabel,
  type GenerationQueueJob,
  type GenerationQueueSummary
} from "@/lib/generation-queue";
import { generationElapsed, isGenerationInFlight } from "@/lib/gallery-generations";
import { useGenerationClock } from "@/lib/use-generation-clock";

const ACTIVE_STATUSES = ["queued", "waiting", "paused", "submitting", "running", "downloading"];

export type JobQueueControls = {
  paused: boolean;
  pauseReason?: string;
  onPause: () => void;
  onResume: () => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  /** Removes one settled job from the queue record; saved outputs are untouched. */
  onDismiss?: (id: string) => void;
  onPrioritize: (id: string, priority: number) => void;
  onClearSettled: () => void;
};

type JobQueueProps = {
  queue: GenerationQueueJob[];
  summary: GenerationQueueSummary;
  concurrency: number;
  controls?: JobQueueControls;
};

function costLabel(job: GenerationQueueJob & { actualCredits?: number }) {
  const credits = job.actualCredits ?? job.estimatedCredits;
  if (typeof credits !== "number") return "";
  return ` · ${job.actualCredits === undefined ? "~" : ""}${credits} cr`;
}

export function JobQueue({ queue, summary, concurrency, controls }: JobQueueProps) {
  const activeJobs = queue.filter((job) => ACTIVE_STATUSES.includes(job.status));
  const runningJobs = activeJobs.filter(isGenerationInFlight).sort((a, b) => (a.startedAt ?? Infinity) - (b.startedAt ?? Infinity));
  const now = useGenerationClock(runningJobs.length > 0);
  const elapsed = runningJobs[0] ? generationElapsed(runningJobs[0], now) : null;
  const settledJobs = queue.filter((job) => !ACTIVE_STATUSES.includes(job.status));
  const visibleJobs = [...runningJobs, ...activeJobs.filter((job) => !isGenerationInFlight(job))].slice(0, 6);
  const failedJobs = settledJobs.filter((job) => job.status === "failed");
  const retryableJobs = failedJobs.slice(0, 3);
  const meterSlots = Math.max(1, Math.min(concurrency, 12));

  return (
    <div className="queueBox">
      <div className="queueHeader">
        <span className="queueHeading">Job queue {elapsed && <time className="queueElapsed" title="Elapsed since the first active job started">{elapsed}</time>}</span>
        <small>
          {summary.inFlight}/{concurrency} active · {summary.queued + summary.waiting} lined up
        </small>
      </div>
      <div className="queueMeter" aria-hidden="true">
        {Array.from({ length: meterSlots }, (_, index) => (
          <span key={index} className={index < summary.inFlight ? "running" : ""} style={{ animationDelay: `${index * -0.7}s` }} />
        ))}
      </div>
      {controls && (
        <div className="queueControls">
          <button type="button" onClick={controls.paused ? controls.onResume : controls.onPause}>
            {controls.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={controls.onClearSettled} disabled={!settledJobs.length} title="Remove finished jobs from the queue; saved images and videos stay in the library">
            Clear generated
          </button>
          {/* A failed job stays on screen until it is dealt with, so the way to
              deal with it belongs beside the other queue actions. */}
          {failedJobs.length > 0 && controls.onDismiss && (
            <button
              type="button"
              className="queueControlDanger"
              onClick={() => failedJobs.forEach((job) => controls.onDismiss?.(job.id))}
            >
              Clear failed
            </button>
          )}
        </div>
      )}
      {controls?.paused && <p className="queueNotice">{controls.pauseReason || "Queue paused."}</p>}
      <div className="queueList">
        {visibleJobs.map((job) => (
          <div className={`queueJob ${job.status}${isGenerationInFlight(job) ? " activityEdge" : ""}`} key={job.id}>
            <div className="queueJobHeading"><strong>{job.title}</strong>
              {isGenerationInFlight(job) && generationElapsed(job, now) && <time className="queueElapsed" title="Elapsed generation time">{generationElapsed(job, now)}</time>}
            </div>
            <small>
              {generationJobKindLabel(job.kind)} · {generationQueueStatusLabel(job.status)}
              {job.batchIndex && job.batchTotal ? ` · ${job.batchIndex}/${job.batchTotal}` : ""}
              {costLabel(job)}
            </small>
            {controls && (
              <div className="queueJobActions">
                <button type="button" onClick={() => controls.onPrioritize(job.id, (job.priority || 0) + 1)}>
                  Bump
                </button>
                <button type="button" onClick={() => controls.onCancel(job.id)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
        {!visibleJobs.length && (
          <div className="queueEmpty">
            <span>Ready</span>
            <small>{summary.complete ? `${summary.complete} finished this session.` : "Generate clicks can stack here."}</small>
          </div>
        )}
        {controls &&
          retryableJobs.map((job) => (
            <div className="queueJob failed" key={job.id}>
              <strong>{job.title}</strong>
              <small>{job.error || "failed"}</small>
              <div className="queueJobActions">
                <button type="button" onClick={() => controls.onRetry(job.id)}>
                  Retry
                </button>
                {controls.onDismiss && (
                  <button type="button" onClick={() => controls.onDismiss?.(job.id)} title="Remove this job from the queue">
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
