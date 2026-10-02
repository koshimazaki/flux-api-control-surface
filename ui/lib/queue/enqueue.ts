import { QUEUE_LANE_BY_KIND, type EnqueueJobInput, type ServerQueueJob } from "./types";
import { buildQueueJobDescriptor } from "./descriptors";
import { sourceFingerprint } from "./failures";
import { reconcileOperation } from "./operation";
import { RequestKeyConflictError, requestFingerprint } from "./request-key";
import { mutateQueueState } from "./store";
import { setJobRuntime } from "./runtime";
import { awaitQueueJob, newQueueJobId, nudgeQueueRunner } from "./runner";
import { FLUX3_IMAGE_API, FLUX3_IMAGE_MODEL, FLUX3_IMAGE_OPERATION, type Flux3ImageRequest } from "@/lib/flux3-image";
import { estimateFlux3VideoUsd, type Flux3VideoRequest } from "@/lib/flux3-video";
import { estimateVideoEditUsd, VIDEO_EDIT_MODEL, VIDEO_EDIT_OPERATION, type VideoEditRequest } from "@/lib/video-edit";
import { estimateVideoUpscaleUsd, VIDEO_UPSCALE_MODEL, VIDEO_UPSCALE_OPERATION, type VideoUpscaleRequest } from "@/lib/video-upscale";
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

function videoOperationTitle(operation: string) {
  if (operation === VIDEO_UPSCALE_OPERATION) return "FLUX 3 Video Upscale";
  if (operation === VIDEO_EDIT_OPERATION) return "FLUX Video Edit";
  return `FLUX 3 ${operation}`;
}

function videoOperationModel(operation: string) {
  if (operation === VIDEO_UPSCALE_OPERATION) return VIDEO_UPSCALE_MODEL;
  if (operation === VIDEO_EDIT_OPERATION) return VIDEO_EDIT_MODEL;
  return "flux-3-video";
}

function estimateVideoUsd(options: EnqueueOptions) {
  if (options.operation === VIDEO_UPSCALE_OPERATION) return estimateVideoUpscaleUsd(options.body as VideoUpscaleRequest);
  if (options.operation === VIDEO_EDIT_OPERATION) return estimateVideoEditUsd(options.body as VideoEditRequest);
  return estimateFlux3VideoUsd(options.body as Flux3VideoRequest);
}

function defaultTitle(options: EnqueueOptions) {
  const bodyTitle = typeof options.body.title === "string" ? options.body.title.trim() : "";
  if (options.title?.trim()) return options.title.trim();
  if (bodyTitle) return bodyTitle;
  if (options.kind === "tool") return `${options.operation}-edit`;
  if (options.kind === "video") return videoOperationTitle(options.operation);
  return "bfl-generation";
}

function estimateJobCost(options: EnqueueOptions) {
  if (typeof options.estimatedCredits === "number" || typeof options.estimatedUsd === "number") {
    return { credits: options.estimatedCredits, usd: options.estimatedUsd };
  }
  if (options.operation === FLUX3_IMAGE_OPERATION) {
    const usd = FLUX3_IMAGE_API?.estimateUsd?.(options.body as Flux3ImageRequest);
    return typeof usd === "number" ? { credits: Math.round(usd * 100), usd } : {};
  }
  if (options.kind === "image") {
    const model = typeof options.body.model === "string" ? options.body.model : "pro-preview";
    const hasReferences = Array.isArray(options.body.references) && options.body.references.length > 0;
    const estimate = estimateMinimumCost(model, hasReferences);
    return { credits: estimate.credits, usd: estimate.usd };
  }
  if (options.kind === "video") {
    const usd = estimateVideoUsd(options);
    return typeof usd === "number" ? { credits: Math.round(usd * 100), usd } : {};
  }
  return {};
}

function modelLabel(options: EnqueueOptions) {
  if (typeof options.body.model === "string" && options.body.model.trim()) return options.body.model.trim();
  if (options.operation === FLUX3_IMAGE_OPERATION) return FLUX3_IMAGE_MODEL;
  if (options.kind === "video") return videoOperationModel(options.operation);
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

/** A job as enqueue returns it: `reused` when a request key matched a job already queued. */
export type EnqueuedJob = ServerQueueJob & { reused?: boolean };

export async function enqueueGenerationJobs(list: EnqueueOptions[]): Promise<EnqueuedJob[]> {
  const now = Date.now();
  // Every route enqueues here, so this is where a job and its body are made to name one product.
  const prepared = list.map(reconcileOperation).map((options) => {
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
    if (options.requestKey) {
      job.requestKey = options.requestKey;
      job.requestHash = requestFingerprint(options.kind, options.operation, options.body);
    }
    return { options, job, descriptor };
  });

  // Under the queue lock, a request key already on a job returns that job
  // rather than queueing (and paying for) the same request twice.
  const reused = new Map<number, ServerQueueJob>();
  await mutateQueueState((state) => {
    reused.clear();
    prepared.forEach((entry, index) => {
      const key = entry.job.requestKey;
      const existing = key ? state.jobs.find((job) => job.requestKey === key) : undefined;
      if (existing) {
        if (existing.requestHash !== entry.job.requestHash) throw new RequestKeyConflictError(key!, existing.id);
        reused.set(index, existing);
        return;
      }
      state.jobs.push(entry.job);
      state.descriptors[entry.job.id] = entry.descriptor;
    });
  });

  const fresh = prepared.filter((_, index) => !reused.has(index));
  for (const entry of fresh) {
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
  if (fresh.length) nudgeQueueRunner(0);
  return prepared.map((entry, index) => {
    const existing = reused.get(index);
    return existing ? { ...existing, reused: true } : entry.job;
  });
}

export async function enqueueGenerationJob(options: EnqueueOptions) {
  const [job] = await enqueueGenerationJobs([options]);
  return job;
}

export type EnqueueAndWaitOutcome = {
  job: EnqueuedJob;
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
