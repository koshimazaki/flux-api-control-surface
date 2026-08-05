import { findQueueJob, mutateQueueState } from "./store";
import { getJobRuntime } from "./runtime";
import type { QueueRecoveryEvent, QueueStoreState, ServerQueueJob } from "./types";

const IN_FLIGHT = new Set<ServerQueueJob["status"]>(["submitting", "running", "downloading"]);

function addRecovery(job: ServerQueueJob, event: QueueRecoveryEvent) {
  job.recovery = [...(job.recovery || []), event].slice(-10);
}

function abandon(job: ServerQueueJob, now: number, detail: string) {
  job.status = "failed";
  job.failureClass = "terminal";
  job.finishedAt = now;
  job.error = detail;
  addRecovery(job, { at: now, event: "restart-abandoned", detail });
}

export type RecoveryReport = {
  resumed: string[];
  abandoned: string[];
};

/**
 * Runs when this process first wins the runner lease. Jobs that were in flight
 * under a previous process (or a previous HMR module instance) either resume
 * from their persisted request id and polling URL, or are failed with an
 * explicit explanation — never silently resubmitted, because that would pay for
 * the same generation twice.
 */
export function recoverOrphanedJobs(options: { activeJobIds: Set<string>; tookOver?: boolean }) {
  return mutateQueueState((state: QueueStoreState) => {
    const now = Date.now();
    const report: RecoveryReport = { resumed: [], abandoned: [] };
    for (const job of state.jobs) {
      if (!IN_FLIGHT.has(job.status)) continue;
      if (options.activeJobIds.has(job.id)) continue;
      if (getJobRuntime(job.id)) continue;

      const descriptor = state.descriptors[job.id];
      if (!job.pollingUrl) {
        abandon(
          job,
          now,
          job.providerRequestId
            ? `Interrupted while submitting BFL request ${job.providerRequestId}; no polling URL was stored. Check the BFL dashboard before retrying so the request is not paid for twice.`
            : // "submitting" is exactly the window where the POST may have
              // succeeded before the write-back died, so this cannot promise
              // that nothing was charged.
              "Interrupted while submitting, before any request id was stored. The request may still have reached BFL — check the BFL dashboard before re-running this job so it is not paid for twice."
        );
        report.abandoned.push(job.id);
        continue;
      }
      if (!descriptor?.recoverable) {
        abandon(
          job,
          now,
          `BFL request ${job.providerRequestId || "(unknown)"} was accepted, but its media inputs were never persisted (the queue store never holds base64 media), so this server cannot rebuild the request and save the result. Download it from the BFL dashboard before the delivery URL expires; re-running the job would pay for it again.`
        );
        report.abandoned.push(job.id);
        continue;
      }
      job.status = "running";
      job.nextPollAt = now;
      addRecovery(job, {
        at: now,
        event: options.tookOver ? "lease-takeover" : "restart-resume",
        detail: `Resumed polling ${job.providerRequestId || "the stored request"} after a runner restart.`
      });
      report.resumed.push(job.id);
    }
    return report;
  });
}

export function markManualRecovery(jobId: string, event: QueueRecoveryEvent) {
  return mutateQueueState((state) => {
    const job = findQueueJob(state, jobId);
    if (job) addRecovery(job, event);
    return job;
  });
}
