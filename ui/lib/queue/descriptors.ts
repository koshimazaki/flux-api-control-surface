import type { QueueJobDescriptor } from "./types";
import type { GenerationJobKind } from "@/lib/generation-queue";

export const OMITTED_MEDIA_PLACEHOLDER = "[media input omitted from queue store]";

const SECRET_KEY_PATTERN = /api.?key|authorization|token|password|secret/i;
// Keys that carry media. A long value under one of these is base64, not text.
const MEDIA_KEY_PATTERN =
  /image|mask|garment|keyframe|frame|video|draft.?cache|reference|person|sample|photo|picture|attachment|file|media|thumbnail/i;
// Keys whose value is human-readable text and must survive at any length. A
// long prompt is the normal case, not a media payload.
const TEXT_KEYS = new Set([
  "prompt",
  "title",
  "notes",
  "note",
  "caption",
  "captionGuide",
  "description",
  "referenceCue",
  "negativePrompt",
  "compiledPrompt",
  "error"
]);
const MAX_STORED_STRING = 2048;

/** Sentinel meaning "drop this key entirely" — a placeholder would be replayed as a real value. */
const DROP = Symbol("drop");

type SanitizeOutcome = {
  body: Record<string, unknown>;
  recoverable: boolean;
  redactedKeys: string[];
};

function isMediaString(key: string, value: string) {
  // A data: URL is embedded media no matter where it appears.
  if (value.startsWith("data:")) return true;
  if (TEXT_KEYS.has(key)) return false;
  // Otherwise only oversized values under media-shaped keys are treated as media,
  // so a long prompt never makes a job unrecoverable.
  return value.length > MAX_STORED_STRING && MEDIA_KEY_PATTERN.test(key);
}

function dropUndefined(entries: Array<[string, unknown]>) {
  return Object.fromEntries(entries.filter(([, value]) => value !== DROP && value !== undefined));
}

function sanitizeValue(value: unknown, key: string, depth: number, state: SanitizeOutcome): unknown {
  if (depth > 6) return "[nested value omitted]";
  if (Array.isArray(value)) {
    return value
      .map((item, index) => sanitizeValue(item, `${key}[${index}]`, depth + 1, state))
      .filter((item) => item !== DROP);
  }
  if (value && typeof value === "object") {
    return dropUndefined(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        sanitizeChild(childKey, childValue, depth + 1, state)
      ])
    );
  }
  if (typeof value === "string" && isMediaString(key, value)) {
    state.recoverable = false;
    state.redactedKeys.push(key);
    return OMITTED_MEDIA_PLACEHOLDER;
  }
  return value;
}

function sanitizeChild(key: string, value: unknown, depth: number, state: SanitizeOutcome): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    // Never store a secret, and never store a stand-in for one: a replayed
    // placeholder would be sent to the provider as the API key and fail auth,
    // pausing the whole queue. Dropping the key lets env/Keychain resolve it.
    if (value !== undefined && value !== null && value !== "") state.redactedKeys.push(key);
    return DROP;
  }
  return sanitizeValue(value, key, depth, state);
}

/**
 * Strips secrets and embedded media out of a request body before it reaches the
 * queue store. `recoverable` reports whether the surviving body is still a
 * faithful copy, which is what decides if a job can be replayed after a restart.
 * Dropping a secret does not make a body unrecoverable — the server resolves the
 * key itself — but redacting media does.
 */
export function sanitizeQueueRequestBody(body: Record<string, unknown>): SanitizeOutcome {
  const state: SanitizeOutcome = { body: {}, recoverable: true, redactedKeys: [] };
  state.body = dropUndefined(
    Object.entries(body || {}).map(([key, value]) => [key, sanitizeChild(key, value, 0, state)])
  );
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
