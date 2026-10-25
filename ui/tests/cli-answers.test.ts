import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const cli = resolve(fileURLToPath(new URL("../cli/bfl-dashboard.mjs", import.meta.url)));
let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

/** A stand-in dashboard: each request gets whatever `answer` does with it. */
function dashboard(answer: (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void) {
  return new Promise<string>((done) => {
    server = createServer(answer).listen(0, "127.0.0.1", () => done(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
  });
}

function runCli(baseUrl: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((done) => {
    const child = execFile(
      process.execPath,
      [cli, ...args, "--base-url", baseUrl, "--json", "-"],
      { env: { ...process.env, BFL_DASHBOARD_RETRY_DELAY_MS: "0" } },
      (error, stdout, stderr) => done({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr: stderr.trim() })
    );
    child.stdin?.end(JSON.stringify({ mode: "t2i", prompt: "a glass fox" }));
  });
}

describe("the CLI when a request ends without its result", () => {
  it("tells a dashboard that is not running from one that is busy", async () => {
    const base = await dashboard(() => undefined);
    const address = base;
    server!.close();
    server = null;
    const result = await runCli(address, ["generate-flux3-image"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^Could not reach the dashboard at http:\/\/127\.0\.0\.1:\d+ \(ECONNREFUSED\)/);
  });

  it("sends a lost paid request again under the same key, then warns it may have started a job", async () => {
    const keys: string[] = [];
    const base = await dashboard((request) => {
      keys.push(String(request.headers["idempotency-key"]));
      request.socket.destroy();
    });
    const result = await runCli(base, ["generate-flux3-image"]);
    expect(result.code).toBe(1);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(result.stderr).toMatch(/^POST \/api\/bfl\/flux3-image got no answer after 3 tries \(.+\)\. It may still have been carried out/);
    expect(result.stderr).toContain("check npm run --silent cli -- queue before sending it again");
    expect(result.stderr).toContain(`Sending it again with Idempotency-Key ${keys[0]} is safe`);
  });

  it("gets the result when a resend under the same key is answered", async () => {
    const keys: string[] = [];
    const base = await dashboard((request, response) => {
      keys.push(String(request.headers["idempotency-key"]));
      if (keys.length === 1) return request.socket.destroy();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ queued: true, jobId: "q-9", reused: true }));
    });
    const result = await runCli(base, ["generate-flux3-image"]);
    expect(result.code).toBe(0);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(result.stdout).toContain('"jobId":"q-9"');
  });

  it("says a job that outlasted the route's wait is still running, and how to follow it", async () => {
    const base = await dashboard((_request, response) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Still running", timedOut: true, queueJobId: "q-7", details: { queueJobId: "q-7" } }));
    });
    const result = await runCli(base, ["generate-flux3-image"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "POST /api/bfl/flux3-image is still running as queue job q-7. It was not sent again and is saved when it finishes. Follow it with npm run --silent cli -- queue q-7 instead of sending it again."
    );
  });
});
