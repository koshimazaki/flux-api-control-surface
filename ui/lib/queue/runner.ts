import { randomUUID } from "node:crypto";
import { selectRunnableGenerationJobs } from "@/lib/generation-queue";
import { acquireRunnerLease, createRunnerOwnerToken } from "./lease";
import { finalizeQueueJob, pollQueueJobStep, submitQueueJob } from "./lifecycle";
import { breakerIsOpen, QUEUE_SOURCE_QUARANTINE_THRESHOLD } from "./failures";
import { recoverOrphanedJobs } from "./recovery";
import { findQueueJob, isQuarantined, mutateQueueState, readQueueState } from "./store";
import { getJobRuntime } from "./runtime";
import type { ServerQueueJob } from "./types";

export const RUNNER_IDLE_INTERVAL_MS = 5_000;
export const RUNNER_LEASE_RETRY_MS = 5_000;
const SETTLED_STATUSES = new Set(["complete", "failed", "cancelled"]);

type RunnerState = {
  owner: string;
  epoch: symbol;
  timer?: ReturnType<typeof setTimeout>;
  ticking: boolean;
  leaseHeld: boolean;
  recovered: boolean;
  active: Set<string>;
  waiters: Map<string, Set<() => void>>;
};

const RUNNER_KEY = Symbol.for("bfl.generation-queue.runner");
// Fresh per module instance. Next dev HMR loads a new copy of this module while
// the old one still holds a pending timer; comparing epochs lets the new module
// re-arm the loop instead of waiting for the stale one to fire.
const MODULE_EPOCH = Symbol("bfl.generation-queue.runner.epoch");

/** One runner per process, cached on globalThis so Next dev HMR cannot spawn a second scheduler. */
export function runnerState(): RunnerState {
  const holder = globalThis as unknown as Record<symbol, RunnerState | undefined>;
  if (!holder[RUNNER_KEY]) {
    holder[RUNNER_KEY] = {
      owner: createRunnerOwnerToken(),
      epoch: MODULE_EPOCH,
      ticking: false,
      leaseHeld: false,
      recovered: false,
      active: new Set(),
      waiters: new Map()
    };
  }
  return holder[RUNNER_KEY]!;
}

function schedule(delayMs: number) {
  const state = runnerState();
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = undefined;
    void tickQueueRunner();
  }, Math.max(0, delayMs));
  // A pending queue tick must never keep `next build`, tests, or the CLI alive.
  state.timer.unref?.();
}

export function nudgeQueueRunner(delayMs = 0) {
  schedule(delayMs);
}

function notifyWaiters(jobId: string) {
  const listeners = runnerState().waiters.get(jobId);
  if (!listeners) return;
  for (const listener of [...listeners]) listener();
}

function track(jobId: string, task: () => Promise<unknown>) {
  const state = runnerState();
  state.active.add(jobId);
  void task()
    .catch(() => undefined)
    .finally(() => {
      state.active.delete(jobId);
      notifyWaiters(jobId);
      nudgeQueueRunner(0);
    });
}

async function advanceRunningJob(job: ServerQueueJob) {
  const step = await pollQueueJobStep(job.id);
  if (step.ready) await finalizeQueueJob(job.id);
}

function nextWakeDelay(jobs: ServerQueueJob[], now: number) {
  const times = jobs
    .flatMap((job) => [job.nextPollAt, job.nextRetryAt])
    .filter((value): value is number => typeof value === "number" && value > 0);
  if (!times.length) return RUNNER_IDLE_INTERVAL_MS;
  return Math.max(50, Math.min(RUNNER_IDLE_INTERVAL_MS, Math.min(...times) - now));
}

export async function tickQueueRunner(): Promise<void> {
  const state = runnerState();
  if (state.ticking) return;
  state.ticking = true;
  try {
    const lease = await acquireRunnerLease(state.owner);
    const hadLease = state.leaseHeld;
    state.leaseHeld = lease.held;
    if (!lease.held) {
      schedule(RUNNER_LEASE_RETRY_MS);
      return;
    }
    if (!state.recovered || !hadLease) {
      await recoverOrphanedJobs({ activeJobIds: state.active, tookOver: lease.tookOver });
      state.recovered = true;
    }

    const store = await readQueueState();
    const now = Date.now();
    const jobs = store.jobs;

    for (const job of jobs) {
      if (state.active.has(job.id)) continue;
      if (job.status !== "running" && job.status !== "downloading") continue;
      if (job.status === "running" && job.nextPollAt && job.nextPollAt > now) continue;
      track(job.id, () => advanceRunningJob(job));
    }

    if (!store.paused) {
      const candidates = jobs.filter(
        (job) =>
          !state.active.has(job.id) &&
          !breakerIsOpen(store.breakers[job.lane], now) &&
          !isQuarantined(store, job.sourceFingerprint, QUEUE_SOURCE_QUARANTINE_THRESHOLD)
      );
      const runnable = selectRunnableGenerationJobs(
        // Keep in-flight jobs visible to the selector so lane/global limits count them.
        [...candidates, ...jobs.filter((job) => state.active.has(job.id))],
        { globalLimit: store.settings.globalLimit, laneLimits: store.settings.laneLimits, now }
      ).filter((job) => !state.active.has(job.id));
      for (const job of runnable) {
        track(job.id, () => submitQueueJob(job.id));
      }
    }

    schedule(nextWakeDelay(jobs, Date.now()));
  } catch {
    schedule(RUNNER_LEASE_RETRY_MS);
  } finally {
    state.ticking = false;
  }
}

/**
 * Idempotent runner start. `instrumentation.ts` cannot own this because the app
 * ships edge middleware, which forces Next to compile the instrumentation hook
 * for the edge runtime where the queue's Node-only imports cannot be bundled.
 * Every Node-runtime route that reads or mutates the queue calls this instead,
 * so the first dashboard, MCP, or CLI touch after a restart revives the runner
 * and its recovery pass, and the runner then keeps working with no tab open.
 */
export function startQueueRunner() {
  const state = runnerState();
  // A pending timer created by a previous module instance would keep ticking
  // stale code, so re-arm whenever this module is not the one that armed it.
  const staleEpoch = state.epoch !== MODULE_EPOCH;
  if (staleEpoch) state.epoch = MODULE_EPOCH;
  if (!state.timer || staleEpoch) nudgeQueueRunner(0);
  return state.owner;
}

export const ensureQueueRunner = startQueueRunner;

export function stopQueueRunner() {
  const state = runnerState();
  if (state.timer) clearTimeout(state.timer);
  state.timer = undefined;
}

export type QueueWaitOutcome = {
  job?: ServerQueueJob;
  timedOut: boolean;
};

/** Resolves once a job settles, so legacy synchronous routes can keep their response shape. */
export function awaitQueueJob(jobId: string, timeoutMs: number): Promise<QueueWaitOutcome> {
  const state = runnerState();
  return new Promise<QueueWaitOutcome>((resolve) => {
    let finished = false;
    const listeners = state.waiters.get(jobId) || new Set<() => void>();
    state.waiters.set(jobId, listeners);

    const cleanup = () => {
      listeners.delete(check);
      if (!listeners.size) state.waiters.delete(jobId);
      clearInterval(safety);
      clearTimeout(deadline);
    };
    const settle = (outcome: QueueWaitOutcome) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(outcome);
    };
    async function check() {
      if (finished) return;
      const store = await readQueueState();
      const job = findQueueJob(store, jobId);
      if (!job) return settle({ timedOut: false });
      if (SETTLED_STATUSES.has(job.status)) settle({ job, timedOut: false });
    }

    listeners.add(check);
    // Safety poll for state changed by another route (cancel, pause) rather than the runner.
    const safety = setInterval(() => void check(), 500);
    safety.unref?.();
    const deadline = setTimeout(() => settle({ timedOut: true }), Math.max(1, timeoutMs));
    deadline.unref?.();
    void check();
    nudgeQueueRunner(0);
  });
}

export function cancelQueueWaiters(jobId: string) {
  notifyWaiters(jobId);
}

export function newQueueJobId() {
  return `job-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function markJobStatus(jobId: string, status: ServerQueueJob["status"]) {
  await mutateQueueState((store) => {
    const job = findQueueJob(store, jobId);
    if (job) job.status = status;
  });
  notifyWaiters(jobId);
}

export function jobRuntimePresent(jobId: string) {
  return Boolean(getJobRuntime(jobId));
}
