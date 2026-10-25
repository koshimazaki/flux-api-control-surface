import { NextResponse } from "next/server";
import { enqueueAndWait, enqueueGenerationJob, type EnqueueOptions } from "./enqueue";
import { requestKeyConflictBody, requestKeyFrom } from "./request-key";
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
  /** The incoming request, read for its Idempotency-Key. */
  request?: Request;
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
  const requestKey = options.request ? requestKeyFrom(options.request, options.enqueue.body) : {};
  if (requestKey.error) return NextResponse.json({ error: requestKey.error }, { status: 400 });
  const enqueue = requestKey.key ? { ...options.enqueue, requestKey: requestKey.key } : options.enqueue;
  try {
    return await answer(options, enqueue);
  } catch (error) {
    const conflict = requestKeyConflictBody(error);
    if (conflict) return NextResponse.json(conflict, { status: 409 });
    throw error;
  }
}

async function answer(options: QueueBackedRouteOptions, enqueue: EnqueueOptions) {
  if (!options.wait) {
    const job = await enqueueGenerationJob(enqueue);
    return NextResponse.json({ queued: true, jobId: job.id, job, ...(job.reused ? { reused: true } : {}) }, { status: 202 });
  }

  const outcome = await enqueueAndWait(enqueue, options.waitMs);
  if (outcome.settled?.status === "complete" && outcome.response) {
    return NextResponse.json(outcome.response);
  }
  if (outcome.settled?.status === "complete" && outcome.job.reused) {
    // Sent again after the first answer was lost, and done long enough ago
    // that its full answer is gone: say where the saved output is.
    return NextResponse.json({
      reused: true,
      queueJobId: outcome.job.id,
      status: "complete",
      resultAssetId: outcome.settled.resultAssetId,
      note: `This request already ran as queue job ${outcome.job.id} and finished; it was not run again. Its output is in Assets (/api/outputs).`
    });
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
