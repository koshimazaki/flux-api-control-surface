import { NextRequest, NextResponse } from "next/server";
import type { GenerationJobKind } from "@/lib/generation-queue";
import { enqueueGenerationJobs, type EnqueueOptions } from "@/lib/queue/enqueue";
import { ensureQueueRunner } from "@/lib/queue/runner";
import {
  cancelQueueJob,
  clearSettledQueueJobs,
  pauseQueue,
  prioritizeQueueJob,
  readQueueSnapshot,
  removeQueueJob,
  resumeQueue,
  retryQueueJob,
  updateQueueSettings
} from "@/lib/queue/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<GenerationJobKind>(["image", "tool", "video"]);

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function operationFor(kind: GenerationJobKind, body: Record<string, any>, explicit?: unknown) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (kind === "tool") return typeof body.tool === "string" ? body.tool : "";
  if (kind === "video") return typeof body.mode === "string" ? body.mode : "";
  return "generate";
}

function toEnqueueOptions(raw: unknown, origin: string): EnqueueOptions | string {
  if (!raw || typeof raw !== "object") return "Each queue job must be an object.";
  const entry = raw as Record<string, any>;
  const kind = entry.kind as GenerationJobKind;
  if (!KINDS.has(kind)) return "Each queue job needs a kind of image, tool, or video.";
  const body = (entry.payload && typeof entry.payload === "object" ? entry.payload : entry.body) as Record<string, any>;
  if (!body || typeof body !== "object") return `A ${kind} queue job needs a payload object.`;
  const operation = operationFor(kind, body, entry.operation);
  if (!operation) return `A ${kind} queue job needs ${kind === "tool" ? "a tool" : "a mode"}.`;
  return {
    kind,
    operation,
    title: typeof entry.title === "string" ? entry.title : undefined,
    body: kind === "video" ? { ...body, operation } : body,
    origin,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    priority: typeof entry.priority === "number" ? entry.priority : undefined,
    dependsOn: Array.isArray(entry.dependsOn) ? entry.dependsOn.filter((id: unknown) => typeof id === "string") : undefined,
    batchId: typeof entry.batchId === "string" ? entry.batchId : undefined,
    batchIndex: typeof entry.batchIndex === "number" ? entry.batchIndex : undefined,
    batchTotal: typeof entry.batchTotal === "number" ? entry.batchTotal : undefined,
    estimatedCredits: typeof entry.estimatedCredits === "number" ? entry.estimatedCredits : undefined,
    estimatedUsd: typeof entry.estimatedUsd === "number" ? entry.estimatedUsd : undefined,
    sourceAssetIds: Array.isArray(entry.sourceAssetIds)
      ? entry.sourceAssetIds.filter((id: unknown): id is string => typeof id === "string")
      : undefined
  };
}

export async function GET(request: NextRequest) {
  ensureQueueRunner();
  const snapshot = await readQueueSnapshot();
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json(snapshot);
  const job = snapshot.jobs.find((entry) => entry.id === id);
  if (!job) return jsonError(`Queue job ${id} was not found`, 404);
  return NextResponse.json({ job, summary: snapshot.summary, paused: snapshot.paused, runner: snapshot.runner });
}

export async function POST(request: NextRequest) {
  ensureQueueRunner();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("Queue enqueue requires a JSON body.");
  const raw = body as Record<string, any>;
  const entries = Array.isArray(raw.jobs) ? raw.jobs : [raw];
  if (!entries.length) return jsonError("Provide at least one job to enqueue.");

  const origin = new URL(request.url).origin;
  const options: EnqueueOptions[] = [];
  for (const entry of entries) {
    const parsed = toEnqueueOptions(entry, origin);
    if (typeof parsed === "string") return jsonError(parsed);
    options.push(parsed);
  }

  const jobs = await enqueueGenerationJobs(options);
  const snapshot = await readQueueSnapshot();
  return NextResponse.json({ ok: true, jobs, summary: snapshot.summary, paused: snapshot.paused });
}

export async function PATCH(request: NextRequest) {
  ensureQueueRunner();
  const body = await request.json().catch(() => null);
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const action = String(raw.action || "").trim();
  const id = (request.nextUrl.searchParams.get("id") || raw.id || "").toString().trim();

  if (action === "pause") return NextResponse.json({ ok: true, ...(await pauseQueue(raw.reason)) });
  if (action === "resume") return NextResponse.json({ ok: true, ...(await resumeQueue()) });
  if (action === "clear-settled") {
    const outcome = await clearSettledQueueJobs();
    return NextResponse.json({ ok: true, removed: outcome.removed, ...outcome.state });
  }
  if (action === "settings") {
    return NextResponse.json({
      ok: true,
      ...(await updateQueueSettings({ globalLimit: raw.globalLimit, laneLimits: raw.laneLimits }))
    });
  }
  if (!id) return jsonError("A queue job id is required for this action.");

  if (action === "retry") {
    const outcome = await retryQueueJob(id);
    if ("error" in outcome) return jsonError(outcome.error, outcome.status);
    return NextResponse.json({ ok: true, job: outcome.job, ...outcome.state });
  }
  if (action === "priority" || action === "reorder") {
    const priority = Number(raw.priority);
    if (!Number.isFinite(priority)) return jsonError("Provide a numeric priority.");
    const outcome = await prioritizeQueueJob(id, priority);
    if ("error" in outcome) return jsonError(outcome.error, outcome.status);
    return NextResponse.json({ ok: true, job: outcome.job, ...outcome.state });
  }
  if (action === "cancel") {
    const outcome = await cancelQueueJob(id);
    if ("error" in outcome) return jsonError(outcome.error, outcome.status);
    return NextResponse.json({ ok: true, job: outcome.job, ...outcome.state });
  }
  return jsonError(`Unknown queue action: ${action || "(none)"}`);
}

export async function DELETE(request: NextRequest) {
  ensureQueueRunner();
  const params = request.nextUrl.searchParams;
  if (params.get("settled") === "true") {
    const outcome = await clearSettledQueueJobs();
    return NextResponse.json({ ok: true, removed: outcome.removed, ...outcome.state });
  }
  const id = params.get("id")?.trim();
  if (!id) return jsonError("Queue delete requires an id, or settled=true.");

  // Cancelling first keeps an in-flight provider request recoverable; a settled
  // job is removed outright.
  const cancelled = await cancelQueueJob(id);
  if (!("error" in cancelled) && params.get("remove") !== "true") {
    return NextResponse.json({ ok: true, job: cancelled.job, ...cancelled.state });
  }
  const removed = await removeQueueJob(id);
  if ("error" in removed) return jsonError(removed.error, removed.status);
  return NextResponse.json({ ok: true, removed: removed.removed, ...removed.state });
}
