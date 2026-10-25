/**
 * What the CLI and the MCP wrapper say when a request to the dashboard ends
 * without its result. A request that never connected did nothing. Anything
 * else may have gone through, and a paid job can be queued and running, so
 * the message says where to look before sending it again, which would pay
 * twice.
 */
import { randomUUID } from "node:crypto";

const NOT_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

/** Routes that start paid jobs. The dashboard honours an Idempotency-Key on each. */
const PAID_SUBMITS = new Set([
  "/api/bfl/generate",
  "/api/bfl/tools",
  "/api/bfl/flux3-image",
  "/api/bfl/flux3-video",
  "/api/bfl/video-edit",
  "/api/bfl/video-upscale",
  "/api/bfl/jobs",
  "/api/dashboard/batch",
  "/api/dashboard/queue"
]);

/** @param {string} method @param {string} path */
export function isPaidSubmit(method, path) {
  return method === "POST" && PAID_SUBMITS.has(path.split("?")[0]);
}

/** @param {any} error */
function notConnected(error) {
  return NOT_CONNECTED.has(String(error?.cause?.code || error?.code || ""));
}

/**
 * Sends a request to the dashboard. A paid submit carries a fresh
 * Idempotency-Key, and when its answer is lost after it may have arrived, it
 * is sent again with the same key: the dashboard answers with the job the
 * first send started instead of starting, and charging for, a second one.
 * Other requests go once, as before. A request that never connected is not
 * retried; nothing reached the dashboard. The error carries `requestKey`.
 * @param {string} url
 * @param {RequestInit & { headers?: Record<string, string> }} init
 * @param {{ method: string, path: string, retries?: number, delayMs?: number, fetcher?: typeof fetch, makeKey?: () => string }} options
 */
export async function fetchDashboard(url, init, { method, path, retries = 2, delayMs = 1500, fetcher = fetch, makeKey = randomUUID }) {
  if (!isPaidSubmit(method, path)) return fetcher(url, init);
  const requestKey = init.headers?.["Idempotency-Key"] || makeKey();
  const sent = { ...init, headers: { ...(init.headers || {}), "Idempotency-Key": requestKey } };
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetcher(url, sent);
    } catch (error) {
      if (notConnected(error) || attempt >= retries) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { requestKey, attempts: attempt + 1 });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
}

/**
 * A request that got no answer at all: the fetch itself threw.
 * @param {any} error
 * @param {{ method: string, path: string, baseUrl: string, follow: (id?: string) => string }} request
 */
export function noAnswerMessage(error, { method, path, baseUrl, follow }) {
  const code = String(error?.cause?.code || error?.code || "");
  const reason = code || error?.cause?.message || error?.message || "no answer";
  if (NOT_CONNECTED.has(code)) {
    return `Could not reach the dashboard at ${baseUrl} (${reason}). Start it with npm run dev, or set BFL_DASHBOARD_URL.`;
  }
  const tries = error?.attempts > 1 ? ` after ${error.attempts} tries` : "";
  const what = /TIMEOUT/i.test(code) ? `got no answer in time${tries}` : `got no answer${tries} (${reason})`;
  if (method === "GET") return `${method} ${path} ${what}.`;
  const resend = error?.requestKey
    ? ` Sending it again with Idempotency-Key ${error.requestKey} is safe: the dashboard returns the job it started instead of running it twice.`
    : "";
  return `${method} ${path} ${what}. It may still have been carried out: if it started a generation, check ${follow()} before sending it again.${resend}`;
}

/**
 * A route that stopped waiting while its job runs on answers with `timedOut`
 * and the queue job id. That is not a failure, so say what it is.
 * @param {any} data
 * @param {{ method: string, path: string, follow: (id?: string) => string }} request
 */
export function stillRunningMessage(data, { method, path, follow }) {
  const id = data?.timedOut ? data.queueJobId || data.details?.queueJobId : null;
  if (!id) return null;
  return `${method} ${path} is still running as queue job ${id}. It was not sent again and is saved when it finishes. Follow it with ${follow(id)} instead of sending it again.`;
}
