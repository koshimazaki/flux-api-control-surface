import { summarizeGenerationQueue, type GenerationLane } from "@/lib/generation-queue";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import { QUEUE_SOURCE_QUARANTINE_THRESHOLD, breakerIsOpen } from "./failures";
import { leaseIsHeldBy, readRunnerLease } from "./lease";
import { queueStorePath } from "./paths";
import { clampLimit, findQueueJob, mutateQueueState, readQueueState } from "./store";
import { cancelQueueWaiters, nudgeQueueRunner, runnerState } from "./runner";
import { forgetJobRuntime } from "./lifecycle";
import type { QueueStoreState, ServerQueueJob } from "./types";

const SETTLED = new Set<ServerQueueJob["status"]>(["complete", "failed", "cancelled"]);
const CANCELLABLE = new Set<ServerQueueJob["status"]>(["queued", "waiting", "paused", "submitting", "running"]);

export type QueueControlError = { error: string; status: number };
export type QueueJobOutcome = QueueControlError | { job: ServerQueueJob; state: PublicQueueState };
export type QueueRemovalOutcome = QueueControlError | { removed: string; state: PublicQueueState };
type PublicQueueState = ReturnType<typeof publicQueueState>;
type MutationResult = { error?: string; status?: number; job?: ServerQueueJob; removed?: string; state?: QueueStoreState };

function controlError(outcome: MutationResult): QueueControlError | null {
  return outcome.error ? { error: outcome.error, status: outcome.status ?? 400 } : null;
}

/** The queue store also holds sanitized execution descriptors; only jobs are ever published. */
export function publicQueueState(state: QueueStoreState, now = Date.now()) {
  return {
    jobs: state.jobs,
    summary: summarizeGenerationQueue(state.jobs),
    paused: state.paused,
    pauseReason: state.pauseReason,
    pausedAt: state.pausedAt,
    settings: state.settings,
    quarantine: state.quarantine.filter((entry) => entry.failures >= QUEUE_SOURCE_QUARANTINE_THRESHOLD),
    breakers: Object.fromEntries(
      Object.entries(state.breakers).map(([lane, breaker]) => [
        lane,
        { failures: breaker?.failures || 0, open: breakerIsOpen(breaker, now), openUntil: breaker?.openUntil }
      ])
    ),
    updatedAt: state.updatedAt,
    storePath: toWorkspaceRelativePath(queueStorePath())
  };
}

export async function readQueueSnapshot() {
  const [state, lease] = await Promise.all([readQueueState(), readRunnerLease()]);
  const now = Date.now();
  const runner = runnerState();
  return {
    ...publicQueueState(state, now),
    runner: {
      owner: runner.owner,
      leaseOwner: lease?.owner,
      leaseHeldByThisProcess: leaseIsHeldBy(lease, runner.owner, now),
      leaseExpiresAt: lease?.expiresAt,
      activeInProcess: runner.active.size
    }
  };
}

export async function pauseQueue(reason?: string) {
  const state = await mutateQueueState((store) => {
    store.paused = true;
    store.pausedAt = Date.now();
    store.pauseReason = reason?.trim() || "Queue paused from the dashboard.";
    return store;
  });
  return publicQueueState(state);
}

export async function resumeQueue() {
  const state = await mutateQueueState((store) => {
    store.paused = false;
    store.pauseReason = undefined;
    store.pausedAt = undefined;
    // Resuming is an explicit operator decision, so lane breakers reopen too.
    store.breakers = {};
    return store;
  });
  nudgeQueueRunner(0);
  return publicQueueState(state);
}

export async function updateQueueSettings(input: { globalLimit?: unknown; laneLimits?: Record<string, unknown> }) {
  const state = await mutateQueueState((store) => {
    if (input.globalLimit !== undefined) {
      store.settings.globalLimit = clampLimit(input.globalLimit, store.settings.globalLimit);
    }
    for (const lane of ["image", "tool", "video"] as GenerationLane[]) {
      const value = input.laneLimits?.[lane];
      if (value !== undefined) store.settings.laneLimits[lane] = clampLimit(value, store.settings.laneLimits[lane]);
    }
    return store;
  });
  nudgeQueueRunner(0);
  return publicQueueState(state);
}

export async function retryQueueJob(jobId: string): Promise<QueueJobOutcome> {
  const outcome = await mutateQueueState<MutationResult>((store) => {
    const job = findQueueJob(store, jobId);
    if (!job) return { error: `Queue job ${jobId} was not found`, status: 404 };
    if (!SETTLED.has(job.status)) return { error: `Job ${jobId} is still ${job.status}.`, status: 409 };

    // A job that already reached the provider has been paid for. Retry must
    // resume polling/finalizing it, never re-submit — a poll-budget timeout
    // leaves exactly this state, and the visible Retry button would double-charge.
    if (job.pollingUrl) {
      job.status = "running";
      job.nextPollAt = Date.now();
      job.pollBudgetStartedAt = Date.now();
      job.nextRetryAt = undefined;
      job.finishedAt = undefined;
      job.error = undefined;
      job.failureClass = undefined;
      job.retryCount = 0;
      job.recovery = [
        ...(job.recovery || []),
        {
          at: Date.now(),
          event: "manual-poll" as const,
          detail: `Retry resumed polling ${job.providerRequestId || "the stored request"} instead of resubmitting.`
        }
      ].slice(-10);
      return { job, state: store };
    }
    if (job.providerRequestId) {
      return {
        error: `Job ${jobId} was accepted by BFL as request ${job.providerRequestId} but stored no polling URL, so it cannot be resumed or safely re-run. Check the BFL dashboard for the result before re-queueing this work.`,
        status: 409
      };
    }
    if (!store.descriptors[jobId]?.recoverable) {
      return {
        error: `Job ${jobId} cannot be retried on the server because its media inputs were never persisted. Re-run it from the workspace that created it.`,
        status: 409
      };
    }
    job.status = "queued";
    job.error = undefined;
    job.failureClass = undefined;
    job.finishedAt = undefined;
    job.startedAt = undefined;
    job.nextRetryAt = undefined;
    job.nextPollAt = undefined;
    job.providerRequestId = undefined;
    job.pollingUrl = undefined;
    job.retryCount = 0;
    job.queuedAt = Date.now();
    if (job.sourceFingerprint) {
      store.quarantine = store.quarantine.filter((entry) => entry.fingerprint !== job.sourceFingerprint);
    }
    return { job, state: store };
  });
  const failed = controlError(outcome);
  if (failed) return failed;
  nudgeQueueRunner(0);
  return { job: outcome.job!, state: publicQueueState(outcome.state!) };
}

export async function prioritizeQueueJob(jobId: string, priority: number): Promise<QueueJobOutcome> {
  const outcome = await mutateQueueState<MutationResult>((store) => {
    const job = findQueueJob(store, jobId);
    if (!job) return { error: `Queue job ${jobId} was not found`, status: 404 };
    job.priority = Math.max(-1000, Math.min(1000, Math.round(priority)));
    return { job, state: store };
  });
  const failed = controlError(outcome);
  if (failed) return failed;
  nudgeQueueRunner(0);
  return { job: outcome.job!, state: publicQueueState(outcome.state!) };
}

export async function cancelQueueJob(jobId: string): Promise<QueueJobOutcome> {
  const outcome = await mutateQueueState<MutationResult>((store) => {
    const job = findQueueJob(store, jobId);
    if (!job) return { error: `Queue job ${jobId} was not found`, status: 404 };
    if (!CANCELLABLE.has(job.status)) return { error: `Job ${jobId} already finished as ${job.status}.`, status: 409 };
    job.status = "cancelled";
    job.finishedAt = Date.now();
    job.nextPollAt = undefined;
    job.nextRetryAt = undefined;
    // A cancelled job that already reached the provider keeps its polling URL so
    // the result can still be recovered through /api/bfl/jobs if it was paid for.
    return { job, state: store };
  });
  const failed = controlError(outcome);
  if (failed) return failed;
  cancelQueueWaiters(jobId);
  return { job: outcome.job!, state: publicQueueState(outcome.state!) };
}

export async function removeQueueJob(jobId: string): Promise<QueueRemovalOutcome> {
  const outcome = await mutateQueueState<MutationResult>((store) => {
    const job = findQueueJob(store, jobId);
    if (!job) return { error: `Queue job ${jobId} was not found`, status: 404 };
    if (!SETTLED.has(job.status)) return { error: `Job ${jobId} is still ${job.status}; cancel it first.`, status: 409 };
    store.jobs = store.jobs.filter((entry) => entry.id !== jobId);
    delete store.descriptors[jobId];
    return { removed: jobId, state: store };
  });
  const failed = controlError(outcome);
  if (failed) return failed;
  forgetJobRuntime(jobId);
  return { removed: outcome.removed!, state: publicQueueState(outcome.state!) };
}

export async function clearSettledQueueJobs() {
  const outcome = await mutateQueueState((store) => {
    const removed = store.jobs.filter((job) => SETTLED.has(job.status)).map((job) => job.id);
    store.jobs = store.jobs.filter((job) => !SETTLED.has(job.status));
    for (const id of removed) delete store.descriptors[id];
    return { removed, state: store };
  });
  outcome.removed.forEach(forgetJobRuntime);
  return { removed: outcome.removed, state: publicQueueState(outcome.state) };
}
