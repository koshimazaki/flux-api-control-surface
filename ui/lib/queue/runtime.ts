import type { GenerationJobKind } from "@/lib/generation-queue";
import type { OperationTimingMarks, PreparedOperation } from "@/lib/operations";

/**
 * Per-job in-process state. Raw request bodies, resolved API keys, prepared
 * media buffers, and the completed response body live here and never in the
 * file-backed store. It is cached on globalThis so Next dev HMR reloads reuse
 * the same map instead of orphaning in-flight work.
 */
export type QueueJobRuntime = {
  jobId: string;
  kind: GenerationJobKind;
  operation: string;
  origin?: string;
  body: Record<string, any>;
  apiKey?: string;
  prepared?: PreparedOperation;
  marks: OperationTimingMarks;
  creditsBefore?: number | null;
  response?: Record<string, any>;
  failure?: { message: string; status: number; details?: unknown };
};

type RuntimeStore = Map<string, QueueJobRuntime>;

const RUNTIME_KEY = Symbol.for("bfl.generation-queue.runtime");

function store(): RuntimeStore {
  const holder = globalThis as unknown as Record<symbol, RuntimeStore | undefined>;
  if (!holder[RUNTIME_KEY]) holder[RUNTIME_KEY] = new Map();
  return holder[RUNTIME_KEY]!;
}

export function setJobRuntime(runtime: QueueJobRuntime) {
  store().set(runtime.jobId, runtime);
  return runtime;
}

export function getJobRuntime(jobId: string) {
  return store().get(jobId);
}

export function clearJobRuntime(jobId: string) {
  store().delete(jobId);
}

export function takeJobResponse(jobId: string) {
  const runtime = store().get(jobId);
  return runtime?.response;
}

/** The route-shaped failure (message + HTTP status + details) recorded by the lifecycle. */
export function takeJobFailure(jobId: string) {
  const runtime = store().get(jobId);
  return runtime?.failure;
}

export function runtimeCount() {
  return store().size;
}

/**
 * Frees the heavy parts of a settled job's runtime: prepared media buffers and
 * the full response body (which carries a base64 data URL). Without this a long
 * session pins hundreds of megabytes of finished work. The response is kept for
 * a short grace period so an in-flight wrapper request can still read it.
 */
export function releaseRuntimeArtifacts(jobId: string, options: { keepResponseMs?: number } = {}) {
  const runtime = store().get(jobId);
  if (!runtime) return;
  runtime.prepared = undefined;
  if (!runtime.response) return;
  const keep = options.keepResponseMs ?? 0;
  if (keep <= 0) {
    runtime.response = undefined;
    return;
  }
  const timer = setTimeout(() => {
    const current = store().get(jobId);
    if (current) current.response = undefined;
  }, keep);
  timer.unref?.();
}
