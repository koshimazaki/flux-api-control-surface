import { NextResponse } from "next/server";
import { enqueueAndWait, enqueueGenerationJob, type EnqueueOptions } from "./enqueue";
import { ensureQueueRunner } from "./runner";
import { takeJobFailure } from "./runtime";

export const IMAGE_ROUTE_WAIT_MS = 300_000;
// Kept under the FLUX 3 route's maxDuration so the handler answers before Next
// tears it down; the job itself keeps running on the server queue.
export const VIDEO_ROUTE_WAIT_MS = 290_000;

export type QueueBackedRouteOptions = {
  enqueue: EnqueueOptions;
  waitMs: number;
  wait: boolean;
  timeoutMessage?: string;
  fallbackError: string;
};

/**
 * Compatibility bridge for the synchronous provider routes. They enqueue into
 * the server-owned queue and wait for the same response body they used to build
 * inline, so every existing HTTP and MCP caller sees an unchanged contract.
 */
export async function queueBackedResponse(options: QueueBackedRouteOptions) {
  ensureQueueRunner();
  if (!options.wait) {
    const job = await enqueueGenerationJob(options.enqueue);
    return NextResponse.json({ queued: true, jobId: job.id, job }, { status: 202 });
  }

  const outcome = await enqueueAndWait(options.enqueue, options.waitMs);
  if (outcome.settled?.status === "complete" && outcome.response) {
    return NextResponse.json(outcome.response);
  }
  if (outcome.timedOut) {
    return NextResponse.json(
      {
        error: options.timeoutMessage || "Timed out waiting for BFL result",
        details: {
          queueJobId: outcome.job.id,
          note: "The job is still running on the server queue. Recover it through /api/dashboard/queue or /api/bfl/jobs."
        }
      },
      { status: 500 }
    );
  }

  const failure = takeJobFailure(outcome.job.id);
  const status = typeof failure?.status === "number" && failure.status >= 400 ? failure.status : 500;
  return NextResponse.json(
    {
      error: failure?.message || outcome.settled?.error || options.fallbackError,
      details: failure?.details,
      queueJobId: outcome.job.id,
      failureClass: outcome.settled?.failureClass
    },
    { status }
  );
}

export function wantsWait(body: Record<string, unknown>) {
  return body.wait !== false;
}
