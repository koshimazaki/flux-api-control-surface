import {
  QUEUE_BREAKER_COOLDOWN_MS,
  QUEUE_MAX_RETRIES,
  QUEUE_SOURCE_QUARANTINE_THRESHOLD,
  classifyProviderFailure,
  computeRetryDelayMs,
  failureClassLabel,
  nextBreakerState,
  pausesQueue,
  shouldRetry
} from "./failures";
import { findQueueJob, isQuarantined, mutateQueueState, recordQuarantineFailure } from "./store";
import type { GenerationFailureClass, QueueJobAttempt, ServerQueueJob } from "./types";

export type JobFailureInput = {
  jobId: string;
  message: string;
  status?: number;
  providerStatus?: string;
  phase: "submit" | "poll" | "finalize";
  /** Overrides taxonomy when the caller already knows the class (e.g. a lost payload). */
  failureClass?: GenerationFailureClass;
  /** Manual recovery calls must not count a source toward batch quarantine. */
  skipQuarantine?: boolean;
  now?: number;
  random?: () => number;
};

export type JobFailureOutcome = {
  failureClass: GenerationFailureClass;
  retrying: boolean;
  /** True when the retry resumes polling an accepted request instead of resubmitting. */
  resumedPolling?: boolean;
  nextRetryAt?: number;
  paused: boolean;
  quarantined: boolean;
};

function pushAttempt(job: ServerQueueJob, attempt: QueueJobAttempt) {
  job.attempts = [...(job.attempts || []), attempt].slice(-10);
}

/**
 * Single place where a provider or lifecycle error becomes queue state: it
 * classifies the failure, decides retry versus terminal, updates the source
 * quarantine and lane breaker, and pauses the queue on credit/auth problems.
 */
export function applyJobFailure(input: JobFailureInput): Promise<JobFailureOutcome> {
  const now = input.now ?? Date.now();
  return mutateQueueState((state) => {
    const job = findQueueJob(state, input.jobId);
    const failureClass =
      input.failureClass ||
      classifyProviderFailure({
        message: input.message,
        status: input.status,
        providerStatus: input.providerStatus
      });
    const outcome: JobFailureOutcome = { failureClass, retrying: false, paused: false, quarantined: false };
    if (!job) return outcome;

    const retryCount = job.retryCount || 0;
    pushAttempt(job, {
      attempt: retryCount + 1,
      startedAt: job.startedAt || job.queuedAt || now,
      endedAt: now,
      status: "failed",
      failureClass,
      phase: input.phase,
      error: input.message,
      providerRequestId: job.providerRequestId
    });
    job.failureClass = failureClass;
    job.error = input.message;

    const lane = state.breakers[job.lane];
    state.breakers[job.lane] = nextBreakerState(lane, failureClass, now);
    if (state.breakers[job.lane]?.openUntil) {
      job.error = `${input.message} (${job.lane} lane paused for ${Math.round(QUEUE_BREAKER_COOLDOWN_MS / 1000)}s after repeated provider failures)`;
    }

    if (!input.skipQuarantine && (failureClass === "terminal" || failureClass === "moderated")) {
      const entry = recordQuarantineFailure(
        state,
        job.sourceFingerprint,
        `${failureClassLabel(failureClass)}: ${input.message}`,
        QUEUE_SOURCE_QUARANTINE_THRESHOLD,
        now
      );
      outcome.quarantined = Boolean(entry && entry.failures >= QUEUE_SOURCE_QUARANTINE_THRESHOLD);
    }

    if (pausesQueue(failureClass)) {
      state.paused = true;
      state.pausedAt = now;
      state.pauseReason = `Queue paused after a ${failureClassLabel(failureClass)} failure: ${input.message}`;
      outcome.paused = true;
    }

    if (shouldRetry(failureClass, retryCount, job.maxRetries ?? QUEUE_MAX_RETRIES)) {
      const delay = computeRetryDelayMs(retryCount, input.random);
      job.retryCount = retryCount + 1;
      // A job that already reached the provider must never go back to "queued":
      // the scheduler would submit it again and pay for the same generation a
      // second time. Retrying a poll or download means resuming polling from the
      // request id and polling URL we already hold.
      const alreadySubmitted = Boolean(job.providerRequestId || job.pollingUrl);
      if (input.phase !== "submit" && alreadySubmitted) {
        job.status = "running";
        job.nextPollAt = now + delay;
        job.nextRetryAt = undefined;
        outcome.resumedPolling = true;
      } else {
        job.nextRetryAt = now + delay;
        job.status = "queued";
        job.startedAt = undefined;
        job.nextPollAt = undefined;
      }
      job.recovery = [
        ...(job.recovery || []),
        {
          at: now,
          event: "retry-scheduled" as const,
          detail: `attempt ${job.retryCount} in ${delay}ms${outcome.resumedPolling ? " (resuming polling, not resubmitting)" : ""}`
        }
      ].slice(-10);
      outcome.retrying = true;
      outcome.nextRetryAt = job.nextPollAt ?? job.nextRetryAt;
      return outcome;
    }

    job.status = "failed";
    job.finishedAt = now;
    return outcome;
  });
}

/** Blocks jobs whose source input already failed terminally elsewhere in the batch. */
export function quarantineBlock(state: Parameters<typeof isQuarantined>[0], job: ServerQueueJob) {
  return isQuarantined(state, job.sourceFingerprint, QUEUE_SOURCE_QUARANTINE_THRESHOLD);
}
