import { rm } from "node:fs/promises";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runnerLeasePath } from "@/lib/queue/paths";
import { mutateQueueState, readQueueState } from "@/lib/queue/store";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  getCredits: vi.fn(),
  resolveApiKey: vi.fn(),
  prepare: vi.fn(),
  finalize: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  getCredits: mocks.getCredits,
  resolveApiKey: mocks.resolveApiKey
}));

vi.mock("@/lib/operations", () => ({
  isOperationFailure: (value: unknown) =>
    Boolean(value && typeof value === "object" && typeof (value as { error?: string }).error === "string"),
  operationAdapter: () => ({
    kind: "image",
    prepare: mocks.prepare,
    finalize: mocks.finalize,
    deliveryUrl: (result: Record<string, any>) =>
      result.result?.sample ? { url: result.result.sample } : { error: "no sample" }
  })
}));

const { POST } = await import("@/app/api/dashboard/batch/route");
const { stopQueueRunner } = await import("@/lib/queue/runner");

const plan = {
  count: 2,
  estimatedCredits: 12,
  requests: [
    {
      title: "flower one",
      endpoint: "/api/bfl/generate",
      method: "POST",
      body: { prompt: "flower one", model: "pro-preview", width: 1024, height: 1024 },
      batchIndex: 1,
      batchTotal: 2,
      promptTokens: 3,
      estimatedCredits: 6,
      estimatedUsd: 0.06
    },
    {
      title: "flower two",
      endpoint: "/api/bfl/generate",
      method: "POST",
      body: { prompt: "flower two", model: "pro-preview", width: 1024, height: 1024 },
      batchIndex: 2,
      batchTotal: 2,
      promptTokens: 3,
      estimatedCredits: 6,
      estimatedUsd: 0.06
    }
  ]
};

function batchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/dashboard/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(async () => {
  stopQueueRunner();
  await mutateQueueState((store) => {
    store.jobs = [];
    store.descriptors = {};
    store.paused = false;
    store.pauseReason = undefined;
    store.breakers = {};
    store.quarantine = [];
  });
  await rm(runnerLeasePath(), { force: true });

  mocks.resolveApiKey.mockResolvedValue("test-key");
  mocks.getCredits.mockResolvedValue(500);
  mocks.prepare.mockImplementation(async (body: Record<string, any>) => ({
    kind: "image",
    operation: "generate",
    title: body.prompt,
    prompt: body.prompt,
    endpoint: "flux-2-pro-preview",
    payload: { prompt: body.prompt },
    sourceAssetIds: [],
    context: {}
  }));
  mocks.bflJson.mockImplementation(async (method: string) =>
    method === "POST"
      ? { id: `bfl-${Math.random().toString(36).slice(2, 6)}`, polling_url: "https://poll.example/batch", cost: 6 }
      : { status: "Ready", result: { sample: "https://delivery.example/batch.png" } }
  );
  mocks.finalize.mockImplementation(async ({ submitted }: { submitted: Record<string, any> }) => ({
    response: { id: submitted.id, sampleUrl: "https://delivery.example/batch.png", outputFiles: { imagePath: "p" } },
    result: { mediaType: "image", assetId: submitted.id },
    timing: { durations: {} },
    actualCredits: 6
  }));

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(plan), { status: 200, headers: { "content-type": "application/json" } }))
  );
});

afterEach(() => {
  stopQueueRunner();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("dashboard batch route", () => {
  it("keeps the dry-run response shape and spends nothing", async () => {
    const response = await POST(batchRequest({ execute: false, batchMode: "library", count: 2 }));
    const data = await response.json();

    expect(data.mode).toBe("dry-run");
    expect(data.plan.count).toBe(2);
    expect(data.nativeMcpHandoff).toBeTruthy();
    expect(mocks.bflJson).not.toHaveBeenCalled();
    expect((await readQueueState()).jobs).toHaveLength(0);
  });

  it("executes through the authoritative queue instead of its own sequential loop", async () => {
    const response = await POST(batchRequest({ execute: true, batchMode: "library", count: 2 }));
    const data = await response.json();

    expect(data.mode).toBe("execute");
    expect(data.requested).toBe(2);
    expect(data.completed).toBe(2);
    expect(data.failed).toBe(0);
    expect(data.estimatedCredits).toBe(12);
    expect(data.outputsRoute).toBe("/api/outputs");
    expect(data.results).toHaveLength(2);
    expect(data.results[0]).toMatchObject({ title: "flower one", ok: true, status: 200, batchIndex: 1, batchTotal: 2 });
    expect(data.results[0].queueJobId).toBeTruthy();

    // Both items became queue jobs under one batch id and settled there.
    const state = await readQueueState();
    expect(state.jobs).toHaveLength(2);
    expect(new Set(state.jobs.map((job) => job.batchId)).size).toBe(1);
    expect(state.jobs.every((job) => job.status === "complete")).toBe(true);
    // The route no longer re-enters /api/bfl/generate; only the plan was fetched.
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).includes("/api/dashboard/run-plan"))).toBe(true);
  }, 20_000);

  it("reports per-item failures with the queue job id and keeps going by default", async () => {
    let submits = 0;
    mocks.bflJson.mockImplementation(async (method: string) => {
      if (method === "POST") {
        submits += 1;
        if (submits === 1) throw new Error('BFL API 422: {"detail":"bad prompt"}');
        return { id: "bfl-ok", polling_url: "https://poll.example/batch", cost: 6 };
      }
      return { status: "Ready", result: { sample: "https://delivery.example/batch.png" } };
    });

    const response = await POST(batchRequest({ execute: true, batchMode: "library", count: 2 }));
    const data = await response.json();

    expect(data.completed).toBe(1);
    expect(data.failed).toBe(1);
    const failure = data.results.find((item: { ok: boolean }) => !item.ok);
    expect(failure.error).toMatch(/422/);
    expect(failure.queueJobId).toBeTruthy();
  }, 20_000);

  it("pays for only one item before stopping when continueOnError is false", async () => {
    let posts = 0;
    mocks.bflJson.mockImplementation(async (method: string) => {
      if (method === "POST") {
        posts += 1;
        throw new Error('BFL API 422: {"detail":"bad prompt"}');
      }
      return { status: "Ready", result: { sample: "https://delivery.example/batch.png" } };
    });

    const response = await POST(batchRequest({ execute: true, batchMode: "library", count: 2, continueOnError: false }));
    const data = await response.json();

    expect(data.results).toHaveLength(1);
    expect(data.completed).toBe(0);
    // Stop-on-error must mean stop spending: the second item is chained behind
    // the first and never reaches the provider.
    expect(posts).toBe(1);
    const state = await readQueueState();
    expect(state.jobs[1]?.dependsOn).toEqual([state.jobs[0]?.id]);
    expect(state.jobs.some((job) => job.status === "cancelled")).toBe(true);
  }, 20_000);

  it("stops immediately when a credits failure pauses the queue", async () => {
    mocks.bflJson.mockImplementation(async (method: string) => {
      if (method === "POST") throw new Error('BFL API 402: {"detail":"insufficient credits"}');
      return { status: "Ready", result: { sample: "https://delivery.example/batch.png" } };
    });

    const started = Date.now();
    const response = await POST(batchRequest({ execute: true, batchMode: "library", count: 2 }));
    const data = await response.json();

    // Without the pause check each remaining item would burn its full wait budget.
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(data.results).toHaveLength(1);
    expect(data.stoppedReason).toMatch(/insufficient credits/i);
    expect((await readQueueState()).paused).toBe(true);
  }, 20_000);
});
