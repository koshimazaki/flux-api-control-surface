import { QUEUE_LANE_BY_KIND, type EnqueueJobInput, type ServerQueueJob } from "./types";
import { buildQueueJobDescriptor } from "./descriptors";
import { sourceFingerprint } from "./failures";
import { mutateQueueState } from "./store";
import { setJobRuntime } from "./runtime";
import { awaitQueueJob, newQueueJobId, nudgeQueueRunner } from "./runner";
import { estimateFlux3VideoUsd, type Flux3VideoRequest } from "@/lib/flux3-video";
import { estimateMinimumCost, estimateTokens } from "@/lib/pricing";
import { takeJobResponse } from "./runtime";

export const DEFAULT_QUEUE_WAIT_MS = 300_000;
export const VIDEO_QUEUE_WAIT_MS = 900_000;

export type EnqueueOptions = EnqueueJobInput & {
  /** Held in memory only; the queue store never receives an API key. */
  apiKey?: string;
  /** Pre-allocated id, so a caller can chain jobs with dependsOn before enqueueing. */
  id?: string;
};

function defaultTitle(options: EnqueueOptions) {
  const bodyTitle = typeof options.body.title === "string" ? options.body.title.trim() : "";
  if (options.title?.trim()) return options.title.trim();
  if (bodyTitle) return bodyTitle;
  if (options.kind === "tool") return `${options.operation}-edit`;
  if (options.kind === "video") return `FLUX.3 ${options.operation}`;
  return "bfl-generation";
}

function estimateJobCost(options: EnqueueOptions) {
  if (typeof options.estimatedCredits === "number" || typeof options.estimatedUsd === "number") {
    return { credits: options.estimatedCredits, usd: options.estimatedUsd };
  }
  if (options.kind === "image") {
    const model = typeof options.body.model === "string" ? options.body.model : "pro-preview";
    const hasReferences = Array.isArray(options.body.references) && options.body.references.length > 0;
    const estimate = estimateMinimumCost(model, hasReferences);
    return { credits: estimate.credits, usd: estimate.usd };
  }
  if (options.kind === "video") {
    const usd = estimateFlux3VideoUsd(options.body as Flux3VideoRequest);
    return typeof usd === "number" ? { credits: Math.round(usd * 100), usd } : {};
  }
  return {};
}

function modelLabel(options: EnqueueOptions) {
  if (typeof options.body.model === "string" && options.body.model.trim()) return options.body.model.trim();
  if (options.kind === "video") return "flux-3-video";
  if (options.kind === "tool") return `flux-tools/${options.operation}`;
  return "pro-preview";
}

function jobFromOptions(options: EnqueueOptions, id: string, now: number): ServerQueueJob {
  const estimate = estimateJobCost(options);
  const sourceAssetIds = [...new Set((options.sourceAssetIds || []).filter(Boolean))];
  const prompt = typeof options.body.prompt === "string" ? options.body.prompt : "";
  return {
    id,
    kind: options.kind,
    lane: QUEUE_LANE_BY_KIND[options.kind],
    operation: options.operation,
    title: defaultTitle(options),
    model: modelLabel(options),
    status: options.dependsOn?.length ? "waiting" : "queued",
    createdAt: now,
    queuedAt: now,
    priority: options.priority ?? 0,
    dependsOn: options.dependsOn?.length ? [...options.dependsOn] : undefined,
    batchId: options.batchId,
    batchIndex: options.batchIndex,
    batchTotal: options.batchTotal,
    promptTokens: options.promptTokens ?? (prompt ? estimateTokens(prompt) : undefined),
    estimatedCredits: estimate.credits,
    estimatedUsd: estimate.usd,
    sourceAssetIds: sourceAssetIds.length ? sourceAssetIds : undefined,
    sourceFingerprint: sourceFingerprint({
      kind: options.kind,
      operation: options.operation,
      sourceAssetIds
    })
  };
}

export async function enqueueGenerationJobs(list: EnqueueOptions[]): Promise<ServerQueueJob[]> {
  const now = Date.now();
  const prepared = list.map((options) => {
    const id = options.id || newQueueJobId();
    const descriptor = buildQueueJobDescriptor({
      jobId: id,
      kind: options.kind,
      operation: options.operation,
      origin: options.origin,
      body: options.body
    });
    const job = jobFromOptions(options, id, now);
    job.payloadRecoverable = descriptor.recoverable;
    return { options, job, descriptor };
  });

  await mutateQueueState((state) => {
    for (const entry of prepared) {
      state.jobs.push(entry.job);
      state.descriptors[entry.job.id] = entry.descriptor;
    }
  });

  for (const entry of prepared) {
    setJobRuntime({
      jobId: entry.job.id,
      kind: entry.options.kind,
      operation: entry.options.operation,
      origin: entry.options.origin,
      body: entry.options.body,
      apiKey: entry.options.apiKey,
      marks: { requestStartedAt: Date.now(), queuedAt: entry.job.queuedAt }
    });
  }
  nudgeQueueRunner(0);
  return prepared.map((entry) => entry.job);
}

export async function enqueueGenerationJob(options: EnqueueOptions) {
  const [job] = await enqueueGenerationJobs([options]);
  return job;
}

export type EnqueueAndWaitOutcome = {
  job: ServerQueueJob;
  settled?: ServerQueueJob;
  response?: Record<string, any>;
  timedOut: boolean;
};

/**
 * Compatibility path for the synchronous HTTP/MCP routes: the queue owns
 * execution, and the caller simply waits for the same completed response it
 * received before the migration. A wait timeout leaves the job running.
 */
export async function enqueueAndWait(
  options: EnqueueOptions,
  waitMs = options.kind === "video" ? VIDEO_QUEUE_WAIT_MS : DEFAULT_QUEUE_WAIT_MS
): Promise<EnqueueAndWaitOutcome> {
  const job = await enqueueGenerationJob(options);
  const outcome = await awaitQueueJob(job.id, waitMs);
  return {
    job,
    settled: outcome.job,
    response: takeJobResponse(job.id),
    timedOut: outcome.timedOut
  };
}
