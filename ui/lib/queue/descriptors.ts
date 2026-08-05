import type { QueueJobDescriptor } from "./types";
import type { GenerationJobKind } from "@/lib/generation-queue";

export const OMITTED_MEDIA_PLACEHOLDER = "[media input omitted from queue store]";
export const OMITTED_SECRET_PLACEHOLDER = "[secret omitted]";

const SECRET_KEY_PATTERN = /api.?key|authorization|token|password|secret/i;
const MAX_STORED_STRING = 2048;

type SanitizeOutcome = {
  body: Record<string, unknown>;
  recoverable: boolean;
  redactedKeys: string[];
};

function looksLikeEmbeddedMedia(value: string) {
  return value.startsWith("data:") || value.length > MAX_STORED_STRING;
}

function sanitizeValue(value: unknown, key: string, depth: number, state: SanitizeOutcome): unknown {
  if (depth > 6) return "[nested value omitted]";
  if (Array.isArray(value)) return value.map((item, index) => sanitizeValue(item, `${key}[${index}]`, depth + 1, state));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitizeChild(childKey, childValue, depth + 1, state)
      ])
    );
  }
  if (typeof value === "string" && looksLikeEmbeddedMedia(value)) {
    state.recoverable = false;
    state.redactedKeys.push(key);
    return OMITTED_MEDIA_PLACEHOLDER;
  }
  return value;
}

function sanitizeChild(key: string, value: unknown, depth: number, state: SanitizeOutcome) {
  if (SECRET_KEY_PATTERN.test(key)) {
    if (value === undefined || value === null || value === "") return undefined;
    state.redactedKeys.push(key);
    return OMITTED_SECRET_PLACEHOLDER;
  }
  return sanitizeValue(value, key, depth, state);
}

/**
 * Strips secrets and embedded media out of a request body before it reaches the
 * queue store. `recoverable` reports whether the surviving body is still a
 * faithful copy, which is what decides if a job can be replayed after a restart.
 */
export function sanitizeQueueRequestBody(body: Record<string, unknown>): SanitizeOutcome {
  const state: SanitizeOutcome = { body: {}, recoverable: true, redactedKeys: [] };
  state.body = Object.fromEntries(
    Object.entries(body || {})
      .map(([key, value]) => [key, sanitizeChild(key, value, 0, state)])
      .filter(([, value]) => value !== undefined)
  ) as Record<string, unknown>;
  return state;
}

export function buildQueueJobDescriptor(options: {
  jobId: string;
  kind: GenerationJobKind;
  operation: string;
  origin?: string;
  body: Record<string, unknown>;
}): QueueJobDescriptor {
  const sanitized = sanitizeQueueRequestBody(options.body);
  return {
    jobId: options.jobId,
    kind: options.kind,
    operation: options.operation,
    origin: options.origin,
    body: sanitized.body,
    recoverable: sanitized.recoverable,
    redactedKeys: sanitized.redactedKeys.length ? [...new Set(sanitized.redactedKeys)] : undefined
  };
}
