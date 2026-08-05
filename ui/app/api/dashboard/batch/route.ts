import { NextRequest, NextResponse } from "next/server";
import { maxReferencesForBflModel } from "@/lib/provider-registry";
import { enqueueGenerationJobs } from "@/lib/queue/enqueue";
import { awaitQueueJob, ensureQueueRunner, newQueueJobId } from "@/lib/queue/runner";
import { takeJobFailure, takeJobResponse } from "@/lib/queue/runtime";
import { findQueueJob, readQueueState } from "@/lib/queue/store";
import { cancelQueueJob } from "@/lib/queue/service";
import { IMAGE_ROUTE_WAIT_MS } from "@/lib/queue/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchBody = {
  execute?: boolean;
  apiKey?: string;
  references?: string[];
  continueOnError?: boolean;
  [key: string]: unknown;
};

function redactApiKey<T extends Record<string, unknown>>(body: T) {
  const { apiKey: _apiKey, ...safeBody } = body;
  return safeBody;
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function referencesFor(item: Record<string, any>, body: BatchBody) {
  const model = String(item.body?.model || body.model || "pro-preview");
  const maxReferences = maxReferencesForBflModel(model);
  const source = Array.isArray(item.body?.references)
    ? item.body.references
    : Array.isArray(body.references)
      ? body.references
      : [];
  return source.filter(Boolean).slice(0, maxReferences);
}

export async function POST(request: NextRequest) {
  let body: BatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const planResponse = await fetch(`${origin}/api/dashboard/run-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(redactApiKey(body)),
    cache: "no-store"
  });
  const plan = await readJson(planResponse);
  if (!planResponse.ok) {
    return NextResponse.json({ error: "Could not build batch plan", details: plan }, { status: planResponse.status });
  }

  const nativeMcpHandoff = {
    ...plan.nativeFluxMcpHandoff,
    note:
      "The control-surface executor uses the same planned request bodies exposed here. Use local execution when you want output files and gallery recovery."
  };

  if (!body.execute) {
    return NextResponse.json({
      mode: "dry-run",
      plan,
      nativeMcpHandoff
    });
  }

  // Batch no longer runs its own sequential executor: every item becomes a queue
  // job, so concurrency, retry, moderation, cost, and recovery cannot drift from
  // the authoritative runner.
  ensureQueueRunner();
  const continueOnError = body.continueOnError !== false;
  const batchId = `batch-${Date.now().toString(36)}`;
  const items: Array<Record<string, any>> = Array.isArray(plan.requests) ? plan.requests : [];
  // Stop-on-error has to mean "spend on one item at a time". Enqueueing the
  // whole batch would let the image lane submit several paid jobs before the
  // first failure is even observed, so the items are chained on dependsOn and
  // the scheduler releases them one by one.
  const ids = items.map(() => newQueueJobId());
  const jobs = await enqueueGenerationJobs(
    items.map((item, index) => ({
      id: ids[index],
      kind: "image" as const,
      operation: "generate",
      title: item.title,
      body: { ...item.body, apiKey: body.apiKey, references: referencesFor(item, body) },
      origin,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
      dependsOn: continueOnError || index === 0 ? undefined : [ids[index - 1]],
      batchId,
      batchIndex: item.batchIndex ?? index + 1,
      batchTotal: item.batchTotal ?? items.length,
      estimatedCredits: item.estimatedCredits,
      estimatedUsd: item.estimatedUsd,
      promptTokens: item.promptTokens
    }))
  );

  const results = [];
  const deadline = Date.now() + IMAGE_ROUTE_WAIT_MS;
  let stopReason = "";
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const item = items[index];
    const started = Date.now();
    // A credits/auth failure pauses the queue; without this check every
    // remaining item would burn its full wait budget before anyone finds out.
    const snapshot = await readQueueState();
    if (snapshot.paused) {
      stopReason = snapshot.pauseReason || "The generation queue is paused.";
      for (const pending of jobs.slice(index)) await cancelQueueJob(pending.id).catch(() => undefined);
      break;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      stopReason = "The batch exceeded its wait budget; the remaining jobs stay on the server queue.";
      break;
    }
    const outcome = await awaitQueueJob(job.id, remaining);
    const settled = outcome.job || findQueueJob(await readQueueState(), job.id);
    const data = takeJobResponse(job.id) || {};
    const failure = takeJobFailure(job.id);
    const ok = settled?.status === "complete";
    results.push({
      title: item.title,
      batchIndex: item.batchIndex,
      batchTotal: item.batchTotal,
      ok,
      status: ok ? 200 : failure?.status || (outcome.timedOut ? 504 : 500),
      durationMs: Date.now() - started,
      id: data.id,
      sampleUrl: data.sampleUrl,
      outputFiles: data.outputFiles,
      submit: data.submit,
      error: ok ? undefined : failure?.message || settled?.error || "Generation failed",
      details: ok ? undefined : failure?.details,
      queueJobId: job.id
    });
    if (!ok && !continueOnError) {
      // Stop-on-error must also stop the jobs the queue has not started yet.
      for (const pending of jobs.slice(index + 1)) await cancelQueueJob(pending.id).catch(() => undefined);
      break;
    }
  }

  const completed = results.filter((item) => item.ok).length;
  return NextResponse.json({
    mode: "execute",
    requested: plan.count,
    completed,
    failed: results.length - completed,
    estimatedCredits: plan.estimatedCredits,
    results,
    batchId,
    stoppedReason: stopReason || undefined,
    outputsRoute: "/api/outputs"
  });
}
