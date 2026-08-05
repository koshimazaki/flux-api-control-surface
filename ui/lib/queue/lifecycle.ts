import { BFL_API_BASE, bflJson, getCredits, resolveApiKey } from "@/lib/bfl-server";
import { measured } from "@/lib/generation-capture";
import { isBflPollFailureStatus } from "@/lib/provider-registry";
import { isOperationFailure, operationAdapter } from "@/lib/operations";
import { applyJobFailure } from "./job-failure";
import { findQueueJob, mutateQueueState, readQueueState } from "./store";
import { clearJobRuntime, getJobRuntime, releaseRuntimeArtifacts, setJobRuntime } from "./runtime";
import type { QueueJobRuntime } from "./runtime";
import type { ServerQueueJob } from "./types";

/** Grace window so an awaiting wrapper request can still read a settled job's response. */
export const RESPONSE_RETENTION_MS = 60_000;

export const QUEUE_POLL_INTERVAL_MS = 750;
export const QUEUE_POLL_SLOW_INTERVAL_MS = 2_000;
export const QUEUE_POLL_FAST_WINDOW_MS = 30_000;
export const QUEUE_PROVIDER_BUDGET_MS: Record<string, number> = { image: 300_000, tool: 300_000, video: 900_000 };

export type LifecycleOutcome = {
  ok: boolean;
  status: ServerQueueJob["status"];
  jobId: string;
  message?: string;
  failureClass?: string;
};

function pollDelay(job: ServerQueueJob, now: number) {
  const since = now - (job.submittedAt || now);
  return since < QUEUE_POLL_FAST_WINDOW_MS ? QUEUE_POLL_INTERVAL_MS : QUEUE_POLL_SLOW_INTERVAL_MS;
}

/**
 * Rebuilds the in-process runtime for a job whose raw body was lost (server
 * restart, HMR). Only a fully recoverable descriptor can be replayed, because a
 * sanitized body no longer carries the media the provider needs.
 */
async function restoreRuntime(jobId: string) {
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

async function requireRuntime(jobId: string) {
  return getJobRuntime(jobId) || (await restoreRuntime(jobId));
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
async function ensurePreparedRuntime(jobId: string, job: ServerQueueJob): Promise<PreparedRuntimeOutcome> {
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
function claimJobForSubmit(jobId: string) {
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

/**
 * Phase 1 of the split lifecycle. Validates and submits one provider operation,
 * then persists the accepted request id and polling URL *before* returning so an
 * HTTP timeout or process exit cannot erase recoverable paid work.
 */
export async function submitQueueJob(jobId: string): Promise<LifecycleOutcome> {
  const claim = await claimJobForSubmit(jobId);
  if (!claim.ok) {
    return { ok: false, status: claim.status, jobId, message: claim.message };
  }

  const runtime = await requireRuntime(jobId);
  if (!runtime) {
    const message = "The queued request payload is no longer available on this server, so the job cannot be submitted.";
    await applyJobFailure({ jobId, message, phase: "submit", failureClass: "terminal" });
    releaseRuntimeArtifacts(jobId);
    return { ok: false, status: "failed", jobId, message, failureClass: "terminal" };
  }

  const adapter = operationAdapter(runtime.kind);
  runtime.marks.requestStartedAt = Date.now();

  try {
    const prepared = await adapter.prepare(runtime.body, runtime.origin);
    if (isOperationFailure(prepared)) {
      runtime.failure = { message: prepared.error, status: prepared.status, details: prepared.details };
      await applyJobFailure({
        jobId,
        message: prepared.error,
        status: prepared.status,
        phase: "submit",
        failureClass: "terminal"
      });
      return { ok: false, status: "failed", jobId, message: prepared.error, failureClass: "terminal" };
    }
    runtime.prepared = prepared;

    const apiKey = runtime.apiKey || (await resolveApiKey(runtime.body.apiKey));
    if (!apiKey) {
      const message = "FLUX API key is required";
      runtime.failure = { message, status: 400 };
      await applyJobFailure({ jobId, message, phase: "submit", failureClass: "auth" });
      return { ok: false, status: "failed", jobId, message, failureClass: "auth" };
    }
    runtime.apiKey = apiKey;

    const credits = await measured(() => getCredits(apiKey));
    runtime.creditsBefore = credits.value;
    runtime.marks.creditsBeforeMs = credits.durationMs;
    runtime.marks.submitStartedAt = Date.now();
    const submitted = await bflJson("POST", `${BFL_API_BASE}/${prepared.endpoint}`, apiKey, prepared.payload);
    runtime.marks.providerAcceptedAt = Date.now();

    const pollingUrl = submitted.polling_url;
    if (!pollingUrl || typeof pollingUrl !== "string") {
      const message = "BFL response did not include a polling URL";
      runtime.failure = { message, status: 502, details: submitted };
      await applyJobFailure({ jobId, message, status: 502, phase: "submit", failureClass: "terminal" });
      return { ok: false, status: "failed", jobId, message, failureClass: "terminal" };
    }

    runtime.prepared = { ...prepared, context: { ...prepared.context, submitted } };
    await mutateQueueState((state) => {
      const job = findQueueJob(state, jobId);
      if (!job) return;
      job.status = "running";
      job.providerRequestId = typeof submitted.id === "string" ? submitted.id : job.providerRequestId;
      job.pollingUrl = pollingUrl;
      job.submittedAt = Date.now();
      job.nextPollAt = Date.now() + QUEUE_POLL_INTERVAL_MS;
      job.pollCount = 0;
      if (typeof submitted.cost === "number") {
        job.submittedCost = submitted.cost;
        job.estimatedCredits = job.estimatedCredits ?? submitted.cost;
      }
      if (typeof runtime.creditsBefore === "number") job.creditsBefore = runtime.creditsBefore;
    });
    return { ok: true, status: "running", jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    runtime.failure = { message, status: 500, details: runtime.prepared?.failureDetails };
    const outcome = await applyJobFailure({ jobId, message, phase: "submit" });
    if (!outcome.retrying) releaseRuntimeArtifacts(jobId);
    return {
      ok: false,
      status: outcome.retrying ? "queued" : "failed",
      jobId,
      message,
      failureClass: outcome.failureClass
    };
  }
}

export type PollStepOptions = {
  /** Manual recovery through /api/bfl/jobs: ignore the scheduler budget and never quarantine. */
  manual?: boolean;
};

/** Phase 2: exactly one provider poll. Never loops inside a request handler. */
export async function pollQueueJobStep(
  jobId: string,
  options: PollStepOptions = {}
): Promise<LifecycleOutcome & { ready?: boolean }> {
  const state = await readQueueState();
  const job = findQueueJob(state, jobId);
  if (!job) return { ok: false, status: "failed", jobId, message: `Queue job ${jobId} was not found` };
  if (!job.pollingUrl) return { ok: false, status: job.status, jobId, message: "This job has no stored polling URL." };

  const runtime = getJobRuntime(jobId);
  const apiKey = runtime?.apiKey || (await resolveApiKey());
  if (!apiKey) {
    const message = "FLUX API key is required";
    await applyJobFailure({ jobId, message, phase: "poll", failureClass: "auth", skipQuarantine: options.manual });
    return { ok: false, status: "failed", jobId, message, failureClass: "auth" };
  }

  const budget = QUEUE_PROVIDER_BUDGET_MS[job.kind] ?? QUEUE_PROVIDER_BUDGET_MS.image;
  // The manual recovery route exists precisely for jobs the scheduler gave up
  // on, so it must reach the provider instead of re-failing on the same budget.
  if (!options.manual && job.submittedAt && Date.now() - job.submittedAt > budget) {
    // Terminal, not retryable: the provider already charged for this request, so
    // resubmitting would double-spend. The polling URL stays on the job so
    // GET/PATCH /api/bfl/jobs can still recover the result.
    const message = "Timed out waiting for BFL result";
    if (runtime) runtime.failure = { message, status: 500, details: runtime.prepared?.failureDetails };
    await applyJobFailure({ jobId, message, phase: "poll", failureClass: "terminal" });
    return { ok: false, status: "failed", jobId, message, failureClass: "terminal" };
  }

  try {
    const result = await bflJson("GET", job.pollingUrl, apiKey);
    if (result.status === "Ready") {
      // Rebuild the prepared request if this process never submitted the job
      // (restart or HMR); otherwise a paid, finished render could not be saved.
      const ensured = await ensurePreparedRuntime(jobId, job);
      if (!ensured.ok) {
        if (runtime) runtime.failure = { message: ensured.message, status: ensured.status ?? 500 };
        await applyJobFailure({
          jobId,
          message: ensured.message,
          phase: "finalize",
          failureClass: "terminal",
          skipQuarantine: options.manual
        });
        releaseRuntimeArtifacts(jobId);
        return { ok: false, status: "failed", jobId, message: ensured.message, failureClass: "terminal" };
      }
      ensured.runtime.marks.providerReadyAt = Date.now();
      ensured.runtime.prepared = {
        ...ensured.runtime.prepared!,
        context: { ...ensured.runtime.prepared!.context, result }
      };
      await mutateQueueState((current) => {
        const target = findQueueJob(current, jobId);
        if (!target) return;
        target.status = "downloading";
        target.nextPollAt = undefined;
        target.pollCount = (target.pollCount || 0) + 1;
      });
      return { ok: true, status: "downloading", jobId, ready: true };
    }
    if (isBflPollFailureStatus(result.status)) {
      const message = `FLUX generation failed: ${JSON.stringify(result)}`;
      if (runtime) runtime.failure = { message, status: 500, details: runtime.prepared?.failureDetails };
      const outcome = await applyJobFailure({
        jobId,
        message,
        providerStatus: String(result.status),
        phase: "poll",
        skipQuarantine: options.manual
      });
      if (!outcome.retrying) releaseRuntimeArtifacts(jobId);
      return {
        ok: false,
        status: outcome.retrying ? (outcome.resumedPolling ? "running" : "queued") : "failed",
        jobId,
        message,
        failureClass: outcome.failureClass
      };
    }
    const now = Date.now();
    await mutateQueueState((current) => {
      const target = findQueueJob(current, jobId);
      if (!target) return;
      target.pollCount = (target.pollCount || 0) + 1;
      target.nextPollAt = now + pollDelay(target, now);
    });
    return { ok: true, status: "running", jobId, ready: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Polling failed";
    if (runtime) runtime.failure = { message, status: 500, details: runtime.prepared?.failureDetails };
    const outcome = await applyJobFailure({ jobId, message, phase: "poll", skipQuarantine: options.manual });
    if (!outcome.retrying) releaseRuntimeArtifacts(jobId);
    return {
      ok: false,
      status: outcome.retrying ? (outcome.resumedPolling ? "running" : "queued") : "failed",
      jobId,
      message,
      failureClass: outcome.failureClass
    };
  }
}

/**
 * Phase 3: download the expiring delivery URL immediately, save through the
 * existing artifact savers, then reconcile the provider cost and credit delta.
 */
export async function finalizeQueueJob(jobId: string, options: PollStepOptions = {}): Promise<LifecycleOutcome> {
  const state = await readQueueState();
  const job = findQueueJob(state, jobId);
  if (!job) return { ok: false, status: "failed", jobId, message: `Queue job ${jobId} was not found` };

  // Rebuilds the prepared request from the persisted descriptor when this
  // process did not submit the job, so a restart cannot strand a paid artifact.
  const ensured = await ensurePreparedRuntime(jobId, job);
  if (!ensured.ok) {
    const runtimeForFailure = getJobRuntime(jobId);
    if (runtimeForFailure) runtimeForFailure.failure = { message: ensured.message, status: ensured.status ?? 500 };
    await applyJobFailure({
      jobId,
      message: ensured.message,
      phase: "finalize",
      failureClass: "terminal",
      skipQuarantine: options.manual
    });
    releaseRuntimeArtifacts(jobId);
    return { ok: false, status: "failed", jobId, message: ensured.message, failureClass: "terminal" };
  }
  const runtime = ensured.runtime;

  const adapter = operationAdapter(runtime.kind);
  const submitted = (runtime.prepared!.context.submitted as Record<string, any>) || {};
  let result = runtime.prepared!.context.result as Record<string, any> | undefined;
  if (!result) {
    // A manual finalize (or a finalize straight after a restart) has no cached
    // Ready body. One poll of the stored URL is a read, not a paid generation.
    const pollKey = runtime.apiKey || (await resolveApiKey());
    if (!job.pollingUrl || !pollKey) {
      return { ok: false, status: job.status, jobId, message: "This job has no Ready provider result to finalize." };
    }
    const polled = await bflJson("GET", job.pollingUrl, pollKey).catch(() => null);
    if (!polled || polled.status !== "Ready") {
      return { ok: false, status: job.status, jobId, message: "This job has no Ready provider result to finalize." };
    }
    result = polled;
    runtime.prepared = { ...runtime.prepared!, context: { ...runtime.prepared!.context, result: polled } };
  }
  const delivery = adapter.deliveryUrl(result);
  if (!delivery.url) {
    const message = delivery.error || "BFL result did not include an output URL";
    runtime.failure = { message, status: 502, details: result };
    await applyJobFailure({
      jobId,
      message,
      status: 502,
      phase: "finalize",
      failureClass: "terminal",
      skipQuarantine: options.manual
    });
    releaseRuntimeArtifacts(jobId);
    return { ok: false, status: "failed", jobId, message, failureClass: "terminal" };
  }

  try {
    const apiKey = runtime.apiKey || (await resolveApiKey());
    // Sequenced before the download so downloadMs measures the artifact transfer
    // alone and stays comparable across image, tool, and video jobs.
    const creditsAfter = apiKey ? await measured(() => getCredits(apiKey)) : { value: null, durationMs: 0 };
    runtime.marks.creditsAfterMs = creditsAfter.durationMs;
    const outcome = await adapter.finalize({
      prepared: runtime.prepared!,
      submitted,
      result,
      pollingUrl: job.pollingUrl || "",
      apiKey: apiKey || "",
      creditsBefore: runtime.creditsBefore ?? null,
      creditsAfter: creditsAfter.value,
      marks: runtime.marks,
      // Queue wait, retries, and recovery ride along in the same saved record
      // rather than in a second run-history store.
      queue: {
        jobId: job.id,
        queueWaitMs: job.queueWaitMs,
        retryCount: job.retryCount,
        attempts: job.attempts,
        recovery: job.recovery
      }
    });
    runtime.response = outcome.response;

    const now = Date.now();
    await mutateQueueState((current) => {
      const target = findQueueJob(current, jobId);
      if (!target) return;
      target.status = "complete";
      target.finishedAt = now;
      target.error = undefined;
      target.failureClass = undefined;
      target.resultAssetId = outcome.result.assetId;
      target.result = outcome.result;
      target.actualCredits = typeof outcome.actualCredits === "number" ? outcome.actualCredits : undefined;
      target.actualUsd = typeof outcome.actualCredits === "number" ? outcome.actualCredits / 100 : undefined;
      target.creditsAfter = typeof creditsAfter.value === "number" ? creditsAfter.value : undefined;
      target.attempts = [
        ...(target.attempts || []),
        {
          attempt: (target.retryCount || 0) + 1,
          startedAt: target.startedAt || target.queuedAt,
          endedAt: now,
          status: "complete" as const,
          providerRequestId: target.providerRequestId,
          durations: {
            submitMs: outcome.timing.durations.submitMs,
            providerMs: outcome.timing.durations.providerMs,
            downloadMs: outcome.timing.durations.downloadMs,
            finalizeMs: outcome.timing.durations.finalizeMs,
            creditsMs: outcome.timing.durations.creditsMs
          }
        }
      ].slice(-10);
      // A completed source clears its quarantine tally so a transient bad batch
      // does not permanently block a good asset.
      if (target.sourceFingerprint) {
        current.quarantine = current.quarantine.filter((entry) => entry.fingerprint !== target.sourceFingerprint);
      }
      current.breakers[target.lane] = { failures: 0 };
    });
    // The artifact is on disk; drop the prepared media now and the base64
    // response once any awaiting wrapper request has had a chance to read it.
    releaseRuntimeArtifacts(jobId, { keepResponseMs: RESPONSE_RETENTION_MS });
    return { ok: true, status: "complete", jobId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the finished result";
    runtime.failure = { message, status: 500 };
    const outcome = await applyJobFailure({ jobId, message, phase: "finalize", skipQuarantine: options.manual });
    if (!outcome.retrying) releaseRuntimeArtifacts(jobId);
    return {
      ok: false,
      status: outcome.retrying ? (outcome.resumedPolling ? "running" : "queued") : "failed",
      jobId,
      message,
      failureClass: outcome.failureClass
    };
  }
}

export function forgetJobRuntime(jobId: string) {
  clearJobRuntime(jobId);
}
