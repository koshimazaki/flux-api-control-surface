import { describe, expect, it } from "vitest";
import { noAnswerMessage, stillRunningMessage } from "@/lib/dashboard-answers.mjs";

const follow = (id?: string) => (id ? `queue ${id}` : "the queue");
const request = { method: "POST", path: "/api/bfl/flux3-image", baseUrl: "http://127.0.0.1:3000", follow };
/** A fetch failure as Node reports it: a TypeError whose cause carries the code. */
const fetchFailure = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });

describe("what agents are told when a request ends without its result", () => {
  it("says the dashboard is not running only when the request never connected", () => {
    expect(noAnswerMessage(fetchFailure("ECONNREFUSED"), request)).toBe(
      "Could not reach the dashboard at http://127.0.0.1:3000 (ECONNREFUSED). Start it with npm run dev, or set BFL_DASHBOARD_URL."
    );
  });

  it("warns that a request that did connect may have started a paid job", () => {
    expect(noAnswerMessage(fetchFailure("UND_ERR_HEADERS_TIMEOUT"), request)).toBe(
      "POST /api/bfl/flux3-image got no answer in time. It may still have been carried out: if it started a generation, check the queue before sending it again."
    );
    expect(noAnswerMessage(fetchFailure("UND_ERR_SOCKET"), request)).toMatch(/^POST \/api\/bfl\/flux3-image got no answer \(UND_ERR_SOCKET\)\. It may still/);
    // A read changes nothing, so it needs no warning.
    expect(noAnswerMessage(fetchFailure("UND_ERR_SOCKET"), { ...request, method: "GET", path: "/api/outputs" })).toBe(
      "GET /api/outputs got no answer (UND_ERR_SOCKET)."
    );
  });

  it("reads a route that stopped waiting as still running, with the job to follow", () => {
    const answer = { error: "Still running…", timedOut: true, queueJobId: "q-7", details: { queueJobId: "q-7" } };
    expect(stillRunningMessage(answer, request)).toBe(
      "POST /api/bfl/flux3-image is still running as queue job q-7. It was not sent again and is saved when it finishes. Follow it with queue q-7 instead of sending it again."
    );
    // Only an answer marked as timed out counts; a real failure is reported as one.
    expect(stillRunningMessage({ error: "Content Moderated", queueJobId: "q-8" }, request)).toBeNull();
    expect(stillRunningMessage(null, request)).toBeNull();
  });
});
