import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueAndWait: vi.fn() }));
vi.mock("@/lib/queue/enqueue", () => ({ enqueueAndWait: mocks.enqueueAndWait, enqueueGenerationJob: vi.fn() }));
vi.mock("@/lib/queue/runner", () => ({ ensureQueueRunner: vi.fn() }));
vi.mock("@/lib/queue/runtime", () => ({ takeJobFailure: vi.fn() }));

const { IMAGE_ROUTE_WAIT_MS, VIDEO_ROUTE_WAIT_MS, queueBackedResponse } = await import("@/lib/queue/http");

/** Node's fetch, used by the MCP wrapper and the CLI, gives up after five minutes without an answer. */
const NODE_FETCH_LIMIT_MS = 300_000;
const uiRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

describe("routes that wait for their result", () => {
  it("answer before Node's fetch gives up, so a caller always gets the job id back", () => {
    expect(IMAGE_ROUTE_WAIT_MS).toBeLessThan(NODE_FETCH_LIMIT_MS);
    expect(VIDEO_ROUTE_WAIT_MS).toBeLessThan(NODE_FETCH_LIMIT_MS);
    // Every route that waits uses one of those two limits, the batch route included.
    const routes = readdirSync(resolve(uiRoot, "app/api"), { recursive: true })
      .map(String)
      .filter((file) => file.endsWith("route.ts"))
      .map((file) => ({ file, source: readFileSync(resolve(uiRoot, "app/api", file), "utf8") }))
      .filter(({ source }) => /waitMs:|deadline = Date\.now\(\)/.test(source));
    expect(routes.length).toBeGreaterThanOrEqual(6);
    for (const { file, source } of routes) {
      const limits = [...source.matchAll(/(?:waitMs:\s*|deadline = Date\.now\(\) \+ )([A-Z_]+)/g)].map((match) => match[1]);
      expect(limits.length, `${file} should wait with a named limit`).toBeGreaterThan(0);
      for (const limit of limits) expect(["IMAGE_ROUTE_WAIT_MS", "VIDEO_ROUTE_WAIT_MS"], file).toContain(limit);
    }
  });

  it("say a job that outlasts the wait is still running, not failed, and give its id", async () => {
    mocks.enqueueAndWait.mockResolvedValue({ job: { id: "q-7" }, timedOut: true });
    const response = await queueBackedResponse({
      enqueue: { kind: "image", operation: "flux3-image", body: {} },
      waitMs: IMAGE_ROUTE_WAIT_MS,
      wait: true,
      fallbackError: "FLUX 3 Image generation failed."
    });
    const data = await response.json();
    // Still not a success status: the video pages read details.queueJobId from a failed answer.
    expect(response.status).toBe(500);
    expect(data).toMatchObject({ timedOut: true, queueJobId: "q-7", details: { queueJobId: "q-7" } });
    expect(data.error).toBe(
      "Still running on the server queue as job q-7 after 290 s. It was not sent again and is saved when it finishes; do not send it again."
    );
  });
});
