export type GenerationTiming = {
  requestStartedAt: string;
  queuedAt?: string;
  submitStartedAt?: string;
  providerAcceptedAt?: string;
  providerReadyAt?: string;
  downloadStartedAt?: string;
  downloadedAt?: string;
  savedAt?: string;
  capturedAt: string;
  durations: {
    queueWaitMs?: number;
    prepareMs?: number;
    creditsMs?: number;
    submitMs?: number;
    providerMs?: number;
    downloadMs?: number;
    finalizeMs?: number;
    totalMs: number;
  };
};

type GenerationTimingInput = {
  requestStartedAt: number;
  queuedAt?: number;
  submitStartedAt?: number;
  providerAcceptedAt?: number;
  providerReadyAt?: number;
  downloadStartedAt?: number;
  downloadedAt?: number;
  /** Set once the artifact is on disk so finalizeMs measures real save work. */
  savedAt?: number;
  capturedAt?: number;
  /** Credit-balance probe time, bucketed on its own instead of inflating prepare/download. */
  creditsBeforeMs?: number;
  creditsAfterMs?: number;
};

function elapsed(start?: number, end?: number) {
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  return Math.max(0, Math.round(end - start));
}

function iso(value?: number) {
  return typeof value === "number" ? new Date(value).toISOString() : undefined;
}

function creditsTotal(input: GenerationTimingInput) {
  if (typeof input.creditsBeforeMs !== "number" && typeof input.creditsAfterMs !== "number") return undefined;
  return Math.max(0, Math.round((input.creditsBeforeMs || 0) + (input.creditsAfterMs || 0)));
}

export function buildGenerationTiming(input: GenerationTimingInput): GenerationTiming {
  const capturedAt = input.capturedAt ?? Date.now();
  const prepareWindow = elapsed(input.requestStartedAt, input.submitStartedAt);
  // The credit check runs inside the prepare window, so remove it there and
  // report it separately; otherwise prepareMs is not comparable across routes.
  const prepareMs =
    typeof prepareWindow === "number"
      ? Math.max(0, prepareWindow - Math.max(0, Math.round(input.creditsBeforeMs || 0)))
      : undefined;
  return {
    requestStartedAt: new Date(input.requestStartedAt).toISOString(),
    queuedAt: iso(input.queuedAt),
    submitStartedAt: iso(input.submitStartedAt),
    providerAcceptedAt: iso(input.providerAcceptedAt),
    providerReadyAt: iso(input.providerReadyAt),
    downloadStartedAt: iso(input.downloadStartedAt),
    downloadedAt: iso(input.downloadedAt),
    savedAt: iso(input.savedAt),
    capturedAt: new Date(capturedAt).toISOString(),
    durations: {
      queueWaitMs: elapsed(input.queuedAt, input.requestStartedAt),
      prepareMs,
      creditsMs: creditsTotal(input),
      submitMs: elapsed(input.submitStartedAt, input.providerAcceptedAt),
      providerMs: elapsed(input.providerAcceptedAt, input.providerReadyAt),
      downloadMs: elapsed(input.downloadStartedAt, input.downloadedAt),
      finalizeMs: elapsed(input.downloadedAt, input.savedAt ?? capturedAt),
      totalMs: elapsed(input.requestStartedAt, capturedAt) ?? 0
    }
  };
}

/** Times an async credit probe so its cost lands in the creditsMs bucket instead of a neighbour phase. */
export async function measured<T>(task: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = Date.now();
  const value = await task();
  return { value, durationMs: Date.now() - started };
}
