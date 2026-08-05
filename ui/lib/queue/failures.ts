import { createHash } from "node:crypto";
import type { GenerationFailureClass } from "./types";

export const QUEUE_MAX_RETRIES = 3;
export const QUEUE_RETRY_BASE_MS = 1_500;
export const QUEUE_RETRY_CEILING_MS = 60_000;
export const QUEUE_SOURCE_QUARANTINE_THRESHOLD = 2;
export const QUEUE_BREAKER_THRESHOLD = 4;
export const QUEUE_BREAKER_COOLDOWN_MS = 60_000;

const MODERATION_PATTERN = /moderat/i;
const AUTH_PATTERN = /unauthor|forbidden|invalid api key|api key is required|x-key/i;
const CREDITS_PATTERN = /insufficient.{0,20}credit|out of credits|no credits/i;
const NETWORK_PATTERN = /fetch failed|econnreset|etimedout|enotfound|socket hang up|network|aborted/i;
const TIMEOUT_PATTERN = /timed out|timeout/i;

/** `bflJson` throws `BFL API <status>: <json>`, so the status is recoverable from the message. */
export function providerStatusFromMessage(message: string) {
  const match = message.match(/BFL API (\d{3})/);
  return match ? Number(match[1]) : undefined;
}

export function classifyProviderFailure(input: {
  message?: string;
  status?: number;
  providerStatus?: string;
}): GenerationFailureClass {
  const message = input.message || "";
  const providerStatus = input.providerStatus || "";
  if (MODERATION_PATTERN.test(providerStatus) || MODERATION_PATTERN.test(message)) return "moderated";

  const status = input.status ?? providerStatusFromMessage(message);
  if (status === 402 || CREDITS_PATTERN.test(message)) return "credits";
  if (status === 401 || status === 403 || AUTH_PATTERN.test(message)) return "auth";
  if (status === 408 || status === 429 || (typeof status === "number" && status >= 500)) return "retryable";
  if (typeof status === "number" && status >= 400) return "terminal";
  if (NETWORK_PATTERN.test(message) || TIMEOUT_PATTERN.test(message)) return "retryable";
  if (providerStatus && providerStatus !== "Ready") return "terminal";
  return "retryable";
}

export function isRetryableFailure(failureClass: GenerationFailureClass) {
  return failureClass === "retryable";
}

export function pausesQueue(failureClass: GenerationFailureClass) {
  return failureClass === "credits" || failureClass === "auth";
}

/** Bounded exponential backoff with jitter; `random` is injectable so tests stay deterministic. */
export function computeRetryDelayMs(retryCount: number, random: () => number = Math.random) {
  const attempt = Math.max(0, Math.floor(retryCount));
  const base = Math.min(QUEUE_RETRY_CEILING_MS, QUEUE_RETRY_BASE_MS * 2 ** attempt);
  const jitter = base * 0.25 * random();
  return Math.round(Math.min(QUEUE_RETRY_CEILING_MS, base + jitter));
}

export function shouldRetry(failureClass: GenerationFailureClass, retryCount: number, maxRetries = QUEUE_MAX_RETRIES) {
  return isRetryableFailure(failureClass) && retryCount < maxRetries;
}

/**
 * A stable identifier for "the same input tried again". Repeated terminal
 * failures against one fingerprint quarantine it so a single bad source image
 * cannot burn an entire permutation batch.
 */
export function sourceFingerprint(input: {
  kind: string;
  operation: string;
  sourceAssetIds?: string[];
  extra?: string;
}) {
  const sources = [...new Set((input.sourceAssetIds || []).filter(Boolean))].sort();
  if (!sources.length && !input.extra) return undefined;
  const hash = createHash("sha1");
  hash.update([input.kind, input.operation, sources.join("|"), input.extra || ""].join("::"));
  return hash.digest("hex").slice(0, 16);
}

export function breakerIsOpen(state: { failures: number; openUntil?: number } | undefined, now: number) {
  return Boolean(state?.openUntil && state.openUntil > now);
}

export function nextBreakerState(
  state: { failures: number; openUntil?: number } | undefined,
  failureClass: GenerationFailureClass,
  now: number
) {
  if (!isRetryableFailure(failureClass)) return { failures: 0 };
  const failures = (state?.failures || 0) + 1;
  return failures >= QUEUE_BREAKER_THRESHOLD
    ? { failures: 0, openUntil: now + QUEUE_BREAKER_COOLDOWN_MS }
    : { failures };
}

export function failureClassLabel(failureClass: GenerationFailureClass) {
  if (failureClass === "credits") return "insufficient credits";
  if (failureClass === "auth") return "authentication";
  if (failureClass === "moderated") return "moderated";
  if (failureClass === "terminal") return "terminal input";
  return "retryable";
}
