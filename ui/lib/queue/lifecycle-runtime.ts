import { isOperationFailure, operationAdapter } from "@/lib/operations";
import { findQueueJob, mutateQueueState, readQueueState } from "./store";
import { getJobRuntime, setJobRuntime } from "./runtime";
import type { QueueJobRuntime } from "./runtime";
import type { ServerQueueJob } from "./types";

/**
 * Rebuilds the in-process runtime for a job whose raw body was lost (server
 * restart, HMR). Only a fully recoverable descriptor can be replayed, because a
 * sanitized body no longer carries the media the provider needs.
 */
export async function restoreRuntime(jobId: string) {
  const state = await readQueueState();
  const job = findQueueJob(state, jobId);
  const descriptor = state.descriptors[jobId];
  if (!job || !descriptor) return undefined;
  if (!descriptor.recoverable) return undefined;
  return setJobRuntime({
    jobId,
    kind: descriptor.kind,
    operation: descriptor.operation,
    origin: descriptor.origin,
    body: { ...descriptor.body },
    marks: { requestStartedAt: Date.now(), queuedAt: job.queuedAt }
  });
}

/**
 * A released runtime has had its body and API key wiped, so it can no longer be
 * replayed; rebuild it from the persisted descriptor instead of trusting the husk.
 */
export async function requireRuntime(jobId: string) {
  const existing = getJobRuntime(jobId);
  if (existing && !existing.released) return existing;
  return (await restoreRuntime(jobId)) || (existing?.released ? undefined : existing);
}

/** True when the user cancelled (or removed) the job while an await was in flight. */
export async function jobIsStillLive(jobId: string) {
  const job = findQueueJob(await readQueueState(), jobId);
  return Boolean(job && job.status !== "cancelled");
}

type PreparedRuntimeOutcome =
  | { ok: true; runtime: QueueJobRuntime }
  | { ok: false; message: string; status?: number };

/**
 * Guarantees a runtime that can finalize. After a server restart a resumed job
 * has no in-memory prepared request, so we rebuild it from the persisted
 * descriptor. `prepare` only resolves local media and assembles the request
 * body — it never contacts the provider, so this cannot charge for anything.
 */
export async function ensurePreparedRuntime(jobId: string, job: ServerQueueJob): Promise<PreparedRuntimeOutcome> {
  const runtime = await requireRuntime(jobId);
  if (!runtime) {
    return {
      ok: false,
      message: `BFL request ${job.providerRequestId || "(unknown)"} finished, but its media inputs were never persisted (the queue store never holds base64 media), so the result cannot be saved automatically. Download it from the stored polling URL before it expires.`
    };
  }
  if (runtime.prepared) return { ok: true, runtime };

  const prepared = await operationAdapter(runtime.kind).prepare(runtime.body, runtime.origin);
  if (isOperationFailure(prepared)) return { ok: false, message: prepared.error, status: prepared.status };
  runtime.prepared = {
    ...prepared,
    context: {
      ...prepared.context,
      // Rebuilt from persisted state so cost reconciliation still works after a restart.
      submitted: { id: job.providerRequestId, cost: job.submittedCost ?? null }
    }
  };
  if (runtime.creditsBefore === undefined) runtime.creditsBefore = job.creditsBefore ?? null;
  return { ok: true, runtime };
}

/**
 * Compare-and-set claim of the submit transition. Checking and writing inside a
 * single locked mutation is what stops two callers (runner tick plus a manual
 * /api/bfl/jobs POST) from both submitting, and refuses any job that already
 * reached the provider.
 */
export function claimJobForSubmit(jobId: string) {
  return mutateQueueState((state) => {
    const job = findQueueJob(state, jobId);
    if (!job) return { ok: false as const, status: "failed" as const, message: `Queue job ${jobId} was not found` };
    if (job.providerRequestId || job.pollingUrl) {
      return {
        ok: false as const,
        status: job.status,
        message: `Job ${jobId} already reached BFL as request ${job.providerRequestId || "(polling URL stored)"}; it can only be polled or finalized.`
      };
    }
    if (job.status !== "queued" && job.status !== "waiting" && job.status !== "failed") {
      return { ok: false as const, status: job.status, message: `Job ${jobId} is ${job.status} and cannot be submitted.` };
    }
    job.status = "submitting";
    job.startedAt = Date.now();
    job.queueWaitMs = Math.max(0, Date.now() - job.queuedAt);
    job.error = undefined;
    job.failureClass = undefined;
    return { ok: true as const, status: "submitting" as const, message: undefined };
  });
}
