import {
  generationJobKindLabel,
  generationQueueStatusLabel,
  type GenerationQueueJob,
  type GenerationQueueSummary
} from "@/lib/generation-queue";

const ACTIVE_STATUSES = ["queued", "waiting", "paused", "submitting", "running", "downloading"];

export type JobQueueControls = {
  paused: boolean;
  pauseReason?: string;
  onPause: () => void;
  onResume: () => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
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
  const settledJobs = queue.filter((job) => !ACTIVE_STATUSES.includes(job.status));
  const visibleJobs = activeJobs.slice(0, 6);
  const retryableJobs = settledJobs.filter((job) => job.status === "failed").slice(0, 3);
  const meterSlots = Math.max(1, Math.min(concurrency, 12));

  return (
    <div className="queueBox">
      <div className="queueHeader">
        <span>Job queue</span>
        <small>
          {summary.inFlight}/{concurrency} active · {summary.queued + summary.waiting} lined up
        </small>
      </div>
      <div className="queueMeter" aria-hidden="true">
        {Array.from({ length: meterSlots }, (_, index) => (
          <span key={index} className={index < summary.inFlight ? "running" : ""} />
        ))}
      </div>
      {controls && (
        <div className="queueControls">
          <button type="button" onClick={controls.paused ? controls.onResume : controls.onPause}>
            {controls.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={controls.onClearSettled} disabled={!settledJobs.length}>
            Clear settled
          </button>
        </div>
      )}
      {controls?.paused && <p className="queueNotice">{controls.pauseReason || "Queue paused."}</p>}
      <div className="queueList">
        {visibleJobs.map((job) => (
          <div className={`queueJob ${job.status}`} key={job.id}>
            <strong>{job.title}</strong>
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
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
