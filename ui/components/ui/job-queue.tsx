import type { GenerationQueueJob, GenerationQueueSummary } from "@/lib/generation-queue";

type JobQueueProps = {
  queue: GenerationQueueJob[];
  summary: GenerationQueueSummary;
  concurrency: number;
};

export function JobQueue({ queue, summary, concurrency }: JobQueueProps) {
  const visibleJobs = queue.filter((job) => job.status === "queued" || job.status === "running").slice(0, 6);
  return (
    <div className="queueBox">
      <div className="queueHeader">
        <span>Job queue</span>
        <small>
          {summary.running}/{concurrency} running · {summary.queued} lined up
        </small>
      </div>
      <div className="queueMeter" aria-hidden="true">
        {Array.from({ length: concurrency }, (_, index) => (
          <span key={index} className={index < summary.running ? "running" : ""} />
        ))}
      </div>
      <div className="queueList">
        {visibleJobs.map((job) => (
          <div className={`queueJob ${job.status}`} key={job.id}>
            <strong>{job.title}</strong>
            <small>
              {job.status === "running" ? "working" : "queued"} · {job.batchIndex}/{job.batchTotal}
            </small>
          </div>
        ))}
        {!visibleJobs.length && (
          <div className="queueEmpty">
            <span>Ready</span>
            <small>Generate clicks can stack here.</small>
          </div>
        )}
      </div>
    </div>
  );
}
