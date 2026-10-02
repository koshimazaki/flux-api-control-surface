/**
 * What the CLI and the MCP wrapper say when a request to the dashboard ends
 * without its result. A request that never connected did nothing. Anything
 * else may have gone through, and a paid job can be queued and running, so
 * the message says where to look before sending it again, which would pay
 * twice.
 */
const NOT_CONNECTED = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

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
  const what = /TIMEOUT/i.test(code) ? "got no answer in time" : `got no answer (${reason})`;
  if (method === "GET") return `${method} ${path} ${what}.`;
  return `${method} ${path} ${what}. It may still have been carried out: if it started a generation, check ${follow()} before sending it again.`;
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
