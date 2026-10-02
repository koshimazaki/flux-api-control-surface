import { NextResponse } from "next/server";
import { enqueueAndWait, enqueueGenerationJob, type EnqueueOptions } from "./enqueue";
import { ensureQueueRunner } from "./runner";
import { takeJobFailure } from "./runtime";

/**
 * How long a route that waits for its result holds the request open, kept
 * under five minutes. Node's fetch, which the MCP wrapper and the CLI use,
 * gives up after five minutes without an answer; the caller is then left with
 * no job id while the job runs on and is charged, and trying again pays twice.
 * Answering first, with the queue job id, lets the caller follow the job
 * instead. The job keeps running on the server queue either way: a 4k FLUX 3
 * Image still has its full poll budget there.
 */
export const IMAGE_ROUTE_WAIT_MS = 290_000;
// The same limit, which also keeps the video routes under their maxDuration.
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
    // Still an error status, so callers that only check for success do not
    // read it as a finished result; the text and `timedOut` say what it is.
    const seconds = Math.round(options.waitMs / 1000);
    return NextResponse.json(
      {
        error:
          options.timeoutMessage ||
          `Still running on the server queue as job ${outcome.job.id} after ${seconds} s. It was not sent again and is saved when it finishes; do not send it again.`,
        timedOut: true,
        queueJobId: outcome.job.id,
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
