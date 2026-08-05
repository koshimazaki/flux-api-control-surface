import { NextRequest, NextResponse } from "next/server";
import { enqueueGenerationJob } from "@/lib/queue/enqueue";
import { finalizeQueueJob, pollQueueJobStep, submitQueueJob } from "@/lib/queue/lifecycle";
import { markManualRecovery } from "@/lib/queue/recovery";
import { ensureQueueRunner } from "@/lib/queue/runner";
import { findQueueJob, readQueueState } from "@/lib/queue/store";
import { takeJobResponse } from "@/lib/queue/runtime";
import type { GenerationJobKind } from "@/lib/generation-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<GenerationJobKind>(["image", "tool", "video"]);

function jsonError(error: string, status = 400, details?: unknown) {
  return NextResponse.json({ error, details }, { status });
}

async function jobById(id: string) {
  const state = await readQueueState();
  return findQueueJob(state, id);
}

function operationFor(kind: GenerationJobKind, body: Record<string, any>) {
  if (kind === "tool") return typeof body.tool === "string" ? body.tool : "";
  if (kind === "video") return typeof body.mode === "string" ? body.mode : "";
  return "generate";
}

/**
 * Submit one provider operation and persist its accepted request id and polling
 * URL before responding. This is a recovery/diagnostic primitive that shares the
 * lifecycle services with the queue runner; it is not a second scheduler.
 */
export async function POST(request: NextRequest) {
  ensureQueueRunner();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Request body must be JSON.");
  const raw = body as Record<string, any>;
  const existingId = typeof raw.id === "string" ? raw.id.trim() : "";

  let jobId = existingId;
  if (!jobId) {
    const kind = raw.kind as GenerationJobKind;
    if (!KINDS.has(kind)) return jsonError("A job kind of image, tool, or video is required.");
    const payload = (raw.payload && typeof raw.payload === "object" ? raw.payload : raw.body) as Record<string, any>;
    if (!payload || typeof payload !== "object") return jsonError("A payload object is required.");
    const operation = operationFor(kind, payload);
    if (!operation) return jsonError(`A ${kind} job needs ${kind === "tool" ? "a tool" : "a mode"}.`);
    const job = await enqueueGenerationJob({
      kind,
      operation,
      body: payload,
      origin: new URL(request.url).origin,
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
      priority: typeof raw.priority === "number" ? raw.priority : undefined
    });
    jobId = job.id;
  } else {
    const existing = await jobById(jobId);
    if (!existing) return jsonError(`Queue job ${jobId} was not found`, 404);
    // providerRequestId is only written after the provider answers, so a job
    // that is mid-submit would slip past a check on that field alone. The
    // authoritative guard is the compare-and-set inside submitQueueJob; this is
    // the friendly early answer.
    const submittable = ["queued", "waiting", "failed"].includes(existing.status);
    if (!submittable || existing.pollingUrl || existing.providerRequestId) {
      return jsonError(
        `Job ${jobId} is ${existing.status}${existing.providerRequestId ? ` as BFL request ${existing.providerRequestId}` : ""} and cannot be submitted again; poll or finalize it instead.`,
        409
      );
    }
  }

  const outcome = await submitQueueJob(jobId);
  const job = await jobById(jobId);
  if (!outcome.ok) {
    // A refused claim is a conflict, not an upstream failure.
    const conflict = /cannot be submitted|already reached BFL/.test(outcome.message || "");
    return NextResponse.json({ error: outcome.message || "Submit failed", job, failureClass: outcome.failureClass }, {
      status: conflict ? 409 : 502
    });
  }
  return NextResponse.json({ ok: true, job, providerRequestId: job?.providerRequestId, pollingUrl: job?.pollingUrl });
}

/** One poll step against the stored polling URL. Client-supplied polling URLs are never accepted. */
export async function GET(request: NextRequest) {
  ensureQueueRunner();
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return jsonError("A queue job id is required.");
  const existing = await jobById(id);
  if (!existing) return jsonError(`Queue job ${id} was not found`, 404);
  if (!existing.pollingUrl) return NextResponse.json({ ok: false, job: existing, ready: false });

  await markManualRecovery(id, { at: Date.now(), event: "manual-poll" });
  // Manual recovery deliberately ignores the scheduler's poll budget (this route
  // exists for jobs it already gave up on) and never counts toward quarantine.
  const outcome = await pollQueueJobStep(id, { manual: true });
  const job = await jobById(id);
  return NextResponse.json({
    ok: outcome.ok,
    ready: Boolean(outcome.ready),
    job,
    error: outcome.ok ? undefined : outcome.message,
    failureClass: outcome.failureClass
  });
}

/** Finalize a Ready result exactly once: download, save, reconcile cost. */
export async function PATCH(request: NextRequest) {
  ensureQueueRunner();
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return jsonError("A queue job id is required.");
  const existing = await jobById(id);
  if (!existing) return jsonError(`Queue job ${id} was not found`, 404);
  if (existing.status === "complete") {
    return NextResponse.json({ ok: true, alreadyComplete: true, job: existing, result: takeJobResponse(id) });
  }

  await markManualRecovery(id, { at: Date.now(), event: "manual-finalize" });
  const outcome = await finalizeQueueJob(id, { manual: true });
  const job = await jobById(id);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message || "Finalize failed", job, failureClass: outcome.failureClass }, {
      status: 502
    });
  }
  return NextResponse.json({ ok: true, job, result: takeJobResponse(id) });
}
