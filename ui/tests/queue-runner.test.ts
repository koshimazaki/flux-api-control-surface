import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireRunnerLease, createRunnerOwnerToken } from "@/lib/queue/lease";
import { runnerLeasePath } from "@/lib/queue/paths";
import { findQueueJob, mutateQueueState, readQueueState } from "@/lib/queue/store";

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

const { enqueueAndWait, enqueueGenerationJob } = await import("@/lib/queue/enqueue");
const { runnerState, stopQueueRunner, tickQueueRunner } = await import("@/lib/queue/runner");

beforeEach(async () => {
  stopQueueRunner();
  const state = runnerState();
  state.active.clear();
  state.recovered = false;
  state.leaseHeld = false;
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
  mocks.getCredits.mockResolvedValue(100);
  mocks.prepare.mockResolvedValue({
    kind: "image",
    operation: "generate",
    title: "fox at dawn",
    prompt: "fox at dawn",
    endpoint: "flux-2-pro-preview",
    payload: { prompt: "fox at dawn" },
    sourceAssetIds: [],
    context: {}
  });
  mocks.bflJson.mockImplementation(async (method: string) =>
    method === "POST"
      ? { id: "bfl-runner-1", polling_url: "https://poll.example/bfl-runner-1", cost: 4 }
      : { status: "Ready", result: { sample: "https://delivery.example/runner.png" } }
  );
  mocks.finalize.mockResolvedValue({
    response: { id: "bfl-runner-1", imageDataUrl: "data:image/png;base64,AAA" },
    result: { mediaType: "image", assetId: "bfl-runner-1", localPath: "outputs/runner.png" },
    timing: { durations: {} },
    actualCredits: 4
  });
});

afterEach(() => {
  stopQueueRunner();
  vi.clearAllMocks();
});

describe("server-owned queue runner", () => {
  it("submits, polls, and finalizes a job with no browser tab involved", async () => {
    const outcome = await enqueueAndWait(
      { kind: "image", operation: "generate", body: { prompt: "fox at dawn" } },
      15_000
    );

    expect(outcome.timedOut).toBe(false);
    expect(outcome.settled?.status).toBe("complete");
    expect(outcome.response).toMatchObject({ id: "bfl-runner-1" });
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-2-pro-preview",
      "test-key",
      { prompt: "fox at dawn" }
    );
    expect(mocks.bflJson).toHaveBeenCalledWith("GET", "https://poll.example/bfl-runner-1", "test-key");
  }, 20_000);

  it("never pays twice: a poll blip resumes polling instead of re-submitting", async () => {
    let posts = 0;
    let polls = 0;
    mocks.bflJson.mockImplementation(async (method: string) => {
      if (method === "POST") {
        posts += 1;
        return { id: "bfl-once", polling_url: "https://poll.example/bfl-once", cost: 4 };
      }
      polls += 1;
      // The first poll fails the way a transient upstream blip does.
      if (polls === 1) throw new Error('BFL API 503: {"detail":"upstream"}');
      return { status: "Ready", result: { sample: "https://delivery.example/once.png" } };
    });

    const outcome = await enqueueAndWait(
      { kind: "image", operation: "generate", body: { prompt: "pay once" } },
      20_000
    );

    expect(outcome.settled?.status).toBe("complete");
    // The whole point: one paid submission, no matter how many polls it took.
    expect(posts).toBe(1);
    expect(polls).toBeGreaterThan(1);
    const stored = findQueueJob(await readQueueState(), outcome.job.id);
    expect(stored?.providerRequestId).toBe("bfl-once");
    expect(stored?.retryCount).toBe(1);
  }, 30_000);

  it("does not submit anything while another process holds the runner lease", async () => {
    await acquireRunnerLease(createRunnerOwnerToken(), Date.now());
    const job = await enqueueGenerationJob({ kind: "image", operation: "generate", body: { prompt: "blocked" } });

    await tickQueueRunner();

    expect(mocks.bflJson).not.toHaveBeenCalled();
    expect(findQueueJob(await readQueueState(), job.id)?.status).toBe("queued");
  });

  it("holds paid work while the queue is paused", async () => {
    const { pauseQueue } = await import("@/lib/queue/service");
    await pauseQueue("credits exhausted");
    const job = await enqueueGenerationJob({ kind: "image", operation: "generate", body: { prompt: "paused" } });

    await tickQueueRunner();

    expect(mocks.bflJson).not.toHaveBeenCalled();
    expect(findQueueJob(await readQueueState(), job.id)?.status).toBe("queued");
  });

  it("stores an estimate and never writes the API key into the store", async () => {
    await enqueueGenerationJob({
      kind: "image",
      operation: "generate",
      body: { prompt: "estimate me", apiKey: "super-secret" },
      apiKey: "super-secret"
    });
    const state = await readQueueState();
    expect(JSON.stringify(state)).not.toContain("super-secret");
    expect(state.jobs[0]?.estimatedCredits).toBeGreaterThan(0);
  });
});
