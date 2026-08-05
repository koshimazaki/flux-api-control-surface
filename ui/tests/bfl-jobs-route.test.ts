import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runnerLeasePath } from "@/lib/queue/paths";
import { findQueueJob, mutateQueueState, readQueueState } from "@/lib/queue/store";
import { setJobRuntime } from "@/lib/queue/runtime";
import type { ServerQueueJob } from "@/lib/queue/types";

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
  patchOutputMetadataFile: vi.fn().mockResolvedValue(true),
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

const { GET, PATCH, POST } = await import("@/app/api/bfl/jobs/route");
const { stopQueueRunner } = await import("@/lib/queue/runner");
const { rm } = await import("node:fs/promises");

function preparedOperation() {
  return {
    kind: "image" as const,
    operation: "generate",
    title: "fox",
    prompt: "fox",
    endpoint: "flux-2-pro-preview",
    payload: { prompt: "fox" },
    sourceAssetIds: [],
    context: {}
  };
}

async function seedJob(overrides: Partial<ServerQueueJob> = {}) {
  const id = overrides.id || `job-${Math.random().toString(36).slice(2, 8)}`;
  await mutateQueueState((state) => {
    state.jobs.push({
      kind: "image",
      lane: "image",
      operation: "generate",
      title: "fox",
      status: "queued",
      createdAt: Date.now(),
      queuedAt: Date.now(),
      sourceFingerprint: "finger-1",
      ...overrides,
      id
    } as ServerQueueJob);
    state.descriptors[id] = {
      jobId: id,
      kind: "image",
      operation: "generate",
      body: { prompt: "fox" },
      recoverable: true
    };
  });
  return id;
}

beforeEach(async () => {
  stopQueueRunner();
  await mutateQueueState((state) => {
    state.jobs = [];
    state.descriptors = {};
    state.paused = true;
    state.quarantine = [];
    state.breakers = {};
  });
  await rm(runnerLeasePath(), { force: true });
  mocks.resolveApiKey.mockResolvedValue("test-key");
  mocks.getCredits.mockResolvedValue(100);
  mocks.prepare.mockResolvedValue(preparedOperation());
});

afterEach(() => {
  stopQueueRunner();
  vi.clearAllMocks();
});

describe("/api/bfl/jobs manual recovery", () => {
  it("polls past the scheduler budget, because that is what recovery is for", async () => {
    const id = await seedJob({
      status: "failed",
      providerRequestId: "bfl-late",
      pollingUrl: "https://poll.example/late",
      // Well beyond the 300s image budget the runner gave up on.
      submittedAt: Date.now() - 600_000
    });
    mocks.bflJson.mockResolvedValue({ status: "Pending" });

    const response = await GET(new NextRequest(`http://localhost/api/bfl/jobs?id=${id}`));
    const data = await response.json();

    expect(mocks.bflJson).toHaveBeenCalledWith("GET", "https://poll.example/late", "test-key");
    expect(data.ready).toBe(false);
  });

  it("does not count a manual poll failure toward source quarantine", async () => {
    const id = await seedJob({
      status: "failed",
      providerRequestId: "bfl-q",
      pollingUrl: "https://poll.example/q",
      submittedAt: Date.now() - 600_000
    });
    mocks.bflJson.mockResolvedValue({ status: "Content Moderated" });

    await GET(new NextRequest(`http://localhost/api/bfl/jobs?id=${id}`));

    const state = await readQueueState();
    expect(state.quarantine).toEqual([]);
  });

  it("recovers a finished job the scheduler had already timed out", async () => {
    const id = await seedJob({
      status: "failed",
      providerRequestId: "bfl-save",
      pollingUrl: "https://poll.example/save",
      submittedAt: Date.now() - 600_000,
      submittedCost: 6
    });
    mocks.bflJson.mockResolvedValue({ status: "Ready", result: { sample: "https://delivery.example/s.png" } });
    mocks.finalize.mockResolvedValue({
      response: { id: "bfl-save" },
      result: { mediaType: "image", assetId: "bfl-save" },
      timing: { durations: {} },
      actualCredits: 6
    });

    const polled = await GET(new NextRequest(`http://localhost/api/bfl/jobs?id=${id}`));
    expect((await polled.json()).ready).toBe(true);

    const finalized = await PATCH(new NextRequest(`http://localhost/api/bfl/jobs?id=${id}`, { method: "PATCH" }));
    expect(finalized.status).toBe(200);
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    expect(findQueueJob(await readQueueState(), id)?.status).toBe("complete");
  });
});

describe("/api/bfl/jobs submit guard", () => {
  it("refuses to submit a job that is already mid-submit, before any request id exists", async () => {
    // providerRequestId is written only after the provider answers, so this is
    // exactly the window a check on that field alone would let through.
    const id = await seedJob({ status: "submitting" });

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      })
    );

    expect(response.status).toBe(409);
    expect(mocks.bflJson).not.toHaveBeenCalled();
  });

  it("refuses to submit a job that already reached the provider", async () => {
    const id = await seedJob({ status: "running", providerRequestId: "bfl-x", pollingUrl: "https://poll.example/x" });

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      })
    );

    expect(response.status).toBe(409);
    expect(mocks.bflJson).not.toHaveBeenCalled();
  });

  it("only one of two concurrent submits of the same job reaches the provider", async () => {
    const id = await seedJob({ status: "queued" });
    setJobRuntime({
      jobId: id,
      kind: "image",
      operation: "generate",
      body: { prompt: "fox" },
      apiKey: "test-key",
      marks: { requestStartedAt: Date.now() }
    });
    mocks.bflJson.mockImplementation(async () => ({ id: "bfl-race", polling_url: "https://poll.example/race" }));

    const request = () =>
      POST(
        new NextRequest("http://localhost/api/bfl/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id })
        })
      );
    const [first, second] = await Promise.all([request(), request()]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    // The compare-and-set is what keeps this at one paid submission.
    expect(mocks.bflJson.mock.calls.filter(([method]) => method === "POST")).toHaveLength(1);
  });
});
