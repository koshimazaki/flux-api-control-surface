import type { GenerationJobKind } from "@/lib/generation-queue";
import type { GenerationTiming } from "@/lib/generation-capture";
import type { QueueJobResult } from "@/lib/queue/types";

export type OperationFailure = {
  error: string;
  status: number;
  details?: unknown;
};

export function isOperationFailure(value: unknown): value is OperationFailure {
  return Boolean(value && typeof value === "object" && typeof (value as OperationFailure).error === "string");
}

/**
 * The result of turning a request body into a submittable provider call. It is
 * held in process only — `context` may carry Buffers and prepared media that
 * must never reach the queue store.
 */
export type PreparedOperation = {
  kind: GenerationJobKind;
  operation: string;
  title: string;
  prompt: string;
  endpoint: string;
  payload: Record<string, unknown>;
  sourceAssetIds: string[];
  context: Record<string, any>;
  /** Extra request diagnostics returned with a failed submit, e.g. reference normalization info. */
  failureDetails?: unknown;
};

export type OperationTimingMarks = {
  requestStartedAt: number;
  queuedAt?: number;
  submitStartedAt?: number;
  providerAcceptedAt?: number;
  providerReadyAt?: number;
  downloadStartedAt?: number;
  downloadedAt?: number;
  savedAt?: number;
  creditsBeforeMs?: number;
  creditsAfterMs?: number;
};

/** Queue provenance written into saved metadata so one record covers waiting, retries, and recovery. */
export type OperationQueueContext = {
  jobId: string;
  queueWaitMs?: number;
  retryCount?: number;
  attempts?: unknown[];
  recovery?: unknown[];
};

export type OperationFinalizeInput = {
  prepared: PreparedOperation;
  submitted: Record<string, any>;
  result: Record<string, any>;
  pollingUrl: string;
  apiKey: string;
  creditsBefore: number | null;
  creditsAfter: number | null;
  marks: OperationTimingMarks;
  queue?: OperationQueueContext;
};

export type OperationFinalizeOutcome = {
  /** The exact JSON body the legacy synchronous route returns to its callers. */
  response: Record<string, any>;
  result: QueueJobResult;
  timing: GenerationTiming;
  actualCredits?: number | null;
};

export type OperationAdapter = {
  kind: GenerationJobKind;
  prepare(body: Record<string, any>, origin?: string): Promise<PreparedOperation | OperationFailure>;
  finalize(input: OperationFinalizeInput): Promise<OperationFinalizeOutcome>;
  /** Reads the delivery URL out of a Ready poll result, or explains why it is unusable. */
  deliveryUrl(result: Record<string, any>): { url?: string; error?: string };
};
