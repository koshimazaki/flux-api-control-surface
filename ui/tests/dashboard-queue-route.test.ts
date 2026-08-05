import { rm } from "node:fs/promises";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runnerLeasePath } from "@/lib/queue/paths";
import { mutateQueueState, readQueueState } from "@/lib/queue/store";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  getCredits: vi.fn(),
  resolveApiKey: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  getCredits: mocks.getCredits,
  resolveApiKey: mocks.resolveApiKey
}));

vi.mock("@/lib/operations", () => ({
  isOperationFailure: () => false,
  operationAdapter: () => ({
    kind: "image",
    prepare: vi.fn(),
    finalize: vi.fn(),
    deliveryUrl: () => ({ error: "unused" })
  })
}));

const { DELETE, GET, PATCH, POST } = await import("@/app/api/dashboard/queue/route");
const { stopQueueRunner } = await import("@/lib/queue/runner");

function request(url: string, init?: RequestInit) {
  return new NextRequest(`http://localhost${url}`, init as never);
}

function jsonRequest(url: string, method: string, body: unknown) {
  return request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(async () => {
  stopQueueRunner();
  // Keep the runner idle so these tests exercise CRUD, not execution.
  mocks.resolveApiKey.mockResolvedValue("");
  await mutateQueueState((store) => {
    store.jobs = [];
    store.descriptors = {};
    store.paused = true;
    store.pauseReason = "test";
    store.breakers = {};
    store.quarantine = [];
  });
  await rm(runnerLeasePath(), { force: true });
});

afterEach(() => {
  stopQueueRunner();
  vi.clearAllMocks();
});

async function enqueueOne(prompt = "a cybernetic flower") {
  const response = await POST(
    jsonRequest("/api/dashboard/queue", "POST", {
      jobs: [{ kind: "image", payload: { prompt } }]
    })
  );
  const data = await response.json();
  return { response, data, job: data.jobs[0] };
}

describe("dashboard queue route", () => {
  it("lists compact jobs, scheduler state, and runner lease info without leaking descriptors", async () => {
    await enqueueOne();
    const response = await GET(request("/api/dashboard/queue"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.jobs).toHaveLength(1);
    expect(data.summary.queued).toBe(1);
    expect(data.settings).toEqual({ globalLimit: 4, laneLimits: { image: 4, tool: 2, video: 2 } });
    expect(data.runner).toHaveProperty("leaseHeldByThisProcess");
    expect(data).not.toHaveProperty("descriptors");
  });

  it("validates enqueue input instead of accepting arbitrary jobs", async () => {
    const missingKind = await POST(jsonRequest("/api/dashboard/queue", "POST", { jobs: [{ payload: {} }] }));
    expect(missingKind.status).toBe(400);

    const missingTool = await POST(
      jsonRequest("/api/dashboard/queue", "POST", { jobs: [{ kind: "tool", payload: { image: "x" } }] })
    );
    expect(missingTool.status).toBe(400);
    expect((await missingTool.json()).error).toMatch(/needs a tool/i);
  });

  it("enqueues several typed jobs in one call and keeps them in one visible order", async () => {
    const response = await POST(
      jsonRequest("/api/dashboard/queue", "POST", {
        jobs: [
          { kind: "image", payload: { prompt: "one" } },
          { kind: "tool", payload: { tool: "deblur", image: "/api/outputs/a/image" } },
          { kind: "video", payload: { mode: "t2v", prompt: "three", duration: 8 } }
        ]
      })
    );
    const data = await response.json();
    expect(data.jobs.map((job: { lane: string }) => job.lane)).toEqual(["image", "tool", "video"]);
    expect(data.summary.total).toBe(3);
  });

  it("pauses and resumes the whole queue", async () => {
    const resumed = await PATCH(jsonRequest("/api/dashboard/queue", "PATCH", { action: "resume" }));
    expect((await resumed.json()).paused).toBe(false);

    const paused = await PATCH(
      jsonRequest("/api/dashboard/queue", "PATCH", { action: "pause", reason: "cooling off" })
    );
    const data = await paused.json();
    expect(data.paused).toBe(true);
    expect(data.pauseReason).toBe("cooling off");
  });

  it("reorders by priority and reports the change", async () => {
    const { job } = await enqueueOne();
    const response = await PATCH(
      jsonRequest("/api/dashboard/queue", "PATCH", { action: "priority", id: job.id, priority: 12 })
    );
    expect((await response.json()).job.priority).toBe(12);
  });

  it("updates persisted concurrency settings within safe bounds", async () => {
    const response = await PATCH(
      jsonRequest("/api/dashboard/queue", "PATCH", {
        action: "settings",
        globalLimit: 6,
        laneLimits: { video: 99 }
      })
    );
    const data = await response.json();
    expect(data.settings.globalLimit).toBe(6);
    expect(data.settings.laneLimits.video).toBe(24);
    expect((await readQueueState()).settings.globalLimit).toBe(6);
  });

  it("cancels a queued job and then removes it", async () => {
    const { job } = await enqueueOne();
    const cancelled = await DELETE(request(`/api/dashboard/queue?id=${job.id}`, { method: "DELETE" }));
    expect((await cancelled.json()).job.status).toBe("cancelled");

    const removed = await DELETE(request(`/api/dashboard/queue?id=${job.id}&remove=true`, { method: "DELETE" }));
    expect((await removed.json()).removed).toBe(job.id);
    expect((await readQueueState()).jobs).toHaveLength(0);
  });

  it("retries a settled job and clears its previous provider state", async () => {
    const { job } = await enqueueOne();
    await mutateQueueState((store) => {
      const target = store.jobs.find((entry) => entry.id === job.id)!;
      target.status = "failed";
      target.error = "BFL API 500";
      target.failureClass = "retryable";
      target.providerRequestId = "bfl-old";
      target.pollingUrl = "https://poll.example/old";
    });

    const response = await PATCH(jsonRequest("/api/dashboard/queue", "PATCH", { action: "retry", id: job.id }));
    const data = await response.json();
    expect(data.job.status).toBe("queued");
    expect(data.job.providerRequestId).toBeUndefined();
    expect(data.job.error).toBeUndefined();
  });

  it("refuses to retry a job whose media inputs were never persisted", async () => {
    const response = await POST(
      jsonRequest("/api/dashboard/queue", "POST", {
        jobs: [{ kind: "image", payload: { prompt: "x", references: ["data:image/png;base64,AAAA"] } }]
      })
    );
    const job = (await response.json()).jobs[0];
    await mutateQueueState((store) => {
      store.jobs.find((entry) => entry.id === job.id)!.status = "failed";
    });

    const retry = await PATCH(jsonRequest("/api/dashboard/queue", "PATCH", { action: "retry", id: job.id }));
    expect(retry.status).toBe(409);
    expect((await retry.json()).error).toMatch(/media inputs were never persisted/i);
  });

  it("clears every settled job in one call", async () => {
    const first = await enqueueOne("one");
    const second = await enqueueOne("two");
    await mutateQueueState((store) => {
      store.jobs.find((entry) => entry.id === first.job.id)!.status = "complete";
    });

    const response = await DELETE(request("/api/dashboard/queue?settled=true", { method: "DELETE" }));
    const data = await response.json();
    expect(data.removed).toEqual([first.job.id]);
    expect(data.jobs.map((job: { id: string }) => job.id)).toEqual([second.job.id]);
  });

  it("returns 404 for an unknown job id", async () => {
    const response = await GET(request("/api/dashboard/queue?id=nope"));
    expect(response.status).toBe(404);
  });
});
