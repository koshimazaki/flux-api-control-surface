export const GENERATION_QUEUE_CONCURRENCY = 10;

export type GenerationQueueStatus = "queued" | "running" | "complete" | "failed";

export type GenerationQueueJob = {
  id: string;
  title: string;
  status: GenerationQueueStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  batchIndex: number;
  batchTotal: number;
  promptTokens: number;
  estimatedCredits: number;
  error?: string;
};

export type GenerationQueueSummary = {
  total: number;
  queued: number;
  running: number;
  complete: number;
  failed: number;
  active: number;
};

export function summarizeGenerationQueue(jobs: GenerationQueueJob[]): GenerationQueueSummary {
  return jobs.reduce<GenerationQueueSummary>(
    (summary, job) => {
      summary.total += 1;
      summary[job.status] += 1;
      if (job.status === "queued" || job.status === "running") summary.active += 1;
      return summary;
    },
    { total: 0, queued: 0, running: 0, complete: 0, failed: 0, active: 0 }
  );
}

export function availableGenerationSlots(running: number, limit = GENERATION_QUEUE_CONCURRENCY) {
  return Math.max(0, limit - Math.max(0, running));
}
