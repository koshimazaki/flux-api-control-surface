import { createHash } from "node:crypto";

/**
 * Request keys make a paid submit safe to send again. The caller makes one
 * key per deliberate request and sends it as `Idempotency-Key` (or
 * `requestKey` in the body); if the answer is lost and it sends the same
 * request again, the queue returns the job the first one started instead of
 * starting, and paying for, a second one. A new click gets a new key, so
 * stacked runs still queue side by side.
 */
export const REQUEST_KEY_HEADER = "idempotency-key";
const REQUEST_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
/** Fields that differ between two sends of the same request without changing what it asks for. */
const VOLATILE_FIELDS = new Set(["apiKey", "wait", "requestKey"]);

export type RequestKeyResult = { key?: string; error?: string };

/** The request key from the header or the body, if any; a malformed one is an error, not ignored. */
export function requestKeyFrom(request: Request, body?: Record<string, unknown>): RequestKeyResult {
  const raw = request.headers.get(REQUEST_KEY_HEADER) ?? (typeof body?.requestKey === "string" ? body.requestKey : undefined);
  if (raw === undefined || raw === null || raw === "") return {};
  const key = raw.trim();
  if (!REQUEST_KEY_PATTERN.test(key)) {
    return { error: "Idempotency-Key must be 8 to 128 letters, digits, dots, colons, underscores or hyphens." };
  }
  return { key };
}

/** One key per job when a request queues several: the request key and the job's position. */
export function entryRequestKey(key: string | undefined, index: number, total: number) {
  return key && total > 1 ? `${key}#${index}` : key;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

/** What a request asks for, so the same key sent with a different request can be refused. */
export function requestFingerprint(kind: string, operation: string, body: Record<string, unknown>) {
  const asked = Object.fromEntries(Object.entries(body).filter(([field]) => !VOLATILE_FIELDS.has(field)));
  return createHash("sha256").update(JSON.stringify(stable({ kind, operation, body: asked }))).digest("hex").slice(0, 32);
}

/** The same key was sent with a different request: refused rather than guessing which one was meant. */
export class RequestKeyConflictError extends Error {
  readonly status = 409;
  constructor(readonly key: string, readonly jobId: string) {
    super(`Idempotency-Key ${key} was already used for a different request (queue job ${jobId}). Use a new key for a new request.`);
  }
}

/** A route's answer for a key conflict, or null when the error is something else. */
export function requestKeyConflictBody(error: unknown) {
  return error instanceof RequestKeyConflictError ? { error: error.message, queueJobId: error.jobId, conflict: true } : null;
}
