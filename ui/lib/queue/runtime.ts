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
  /** Set once the job settled and its body/key were wiped; rebuild from the descriptor. */
  released?: boolean;
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
 * Frees everything heavy or sensitive once a job settles: prepared media
 * buffers, the raw request body (megabytes of base64), the resolved API key,
 * and the response body. Nothing legitimate reads these afterwards — a retry
 * re-prepares from the persisted descriptor and re-resolves the key from env or
 * Keychain — so holding them on globalThis would only pin memory and keep a
 * live secret in the process for as long as the queue record exists.
 */
export function releaseRuntimeArtifacts(jobId: string, options: { keepResponseMs?: number } = {}) {
  const runtime = store().get(jobId);
  if (!runtime) return;
  runtime.prepared = undefined;
  runtime.body = {};
  runtime.apiKey = undefined;
  runtime.creditsBefore = undefined;
  // Marks this runtime as a husk: anything that needs the request again must
  // rebuild it from the descriptor rather than trust the emptied body.
  runtime.released = true;
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
