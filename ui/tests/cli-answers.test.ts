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
    const child = execFile(process.execPath, [cli, ...args, "--base-url", baseUrl, "--json", "-"], (error, stdout, stderr) =>
      done({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr: stderr.trim() })
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

  it("warns that a request whose answer was lost may have started a paid job", async () => {
    const base = await dashboard((request) => request.socket.destroy());
    const result = await runCli(base, ["generate-flux3-image"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^POST \/api\/bfl\/flux3-image got no answer \(.+\)\. It may still have been carried out/);
    expect(result.stderr).toContain("check npm run --silent cli -- queue before sending it again");
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
