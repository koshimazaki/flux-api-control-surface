import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queueDir } from "@/lib/queue/paths";
import { findQueueJob, mutateQueueState, readQueueState } from "@/lib/queue/store";
import { clearJobRuntime, getJobRuntime, setJobRuntime } from "@/lib/queue/runtime";
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
      result.result?.sample ? { url: result.result.sample } : { error: "BFL result did not include an image URL" }
  })
}));

const { finalizeQueueJob, pollQueueJobStep, submitQueueJob } = await import("@/lib/queue/lifecycle");

function seedJob(overrides: Partial<ServerQueueJob> = {}) {
  const id = overrides.id || `job-${Math.random().toString(36).slice(2, 8)}`;
  const job: ServerQueueJob = {
    kind: "image",
    lane: "image",
    operation: "generate",
    title: "fox at dawn",
    status: "queued",
    createdAt: Date.now(),
    queuedAt: Date.now(),
    ...overrides,
    id
  };
  return mutateQueueState((state) => {
    state.jobs.push(job);
    state.descriptors[id] = {
      jobId: id,
      kind: job.kind,
      operation: job.operation,
      body: { prompt: "fox at dawn" },
      recoverable: true
    };
    return job;
  }).then((created) => {
    setJobRuntime({
      jobId: id,
      kind: job.kind,
      operation: job.operation,
      body: { prompt: "fox at dawn" },
      marks: { requestStartedAt: Date.now(), queuedAt: job.queuedAt }
    });
    return created;
  });
}

async function readJob(id: string) {
  return findQueueJob(await readQueueState(), id);
}

function preparedOperation() {
  return {
    kind: "image" as const,
    operation: "generate",
    title: "fox at dawn",
    prompt: "fox at dawn",
    endpoint: "flux-2-pro-preview",
    payload: { prompt: "fox at dawn" },
    sourceAssetIds: [],
    context: {}
  };
}

beforeEach(async () => {
  await rm(queueDir(), { recursive: true, force: true });
  mocks.resolveApiKey.mockResolvedValue("test-key");
  mocks.getCredits.mockResolvedValue(100);
  mocks.prepare.mockResolvedValue(preparedOperation());
});

afterEach(() => vi.clearAllMocks());

describe("provider lifecycle: submit", () => {
  it("persists the accepted request id and polling URL before any poll happens", async () => {
    const job = await seedJob();
    mocks.bflJson.mockResolvedValue({ id: "bfl-1", polling_url: "https://poll.example/bfl-1", cost: 3 });

    const outcome = await submitQueueJob(job.id);

    expect(outcome.ok).toBe(true);
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("running");
    expect(stored?.providerRequestId).toBe("bfl-1");
    expect(stored?.pollingUrl).toBe("https://poll.example/bfl-1");
    // Exactly one upstream call so far: the submit. Nothing polled yet.
    expect(mocks.bflJson).toHaveBeenCalledTimes(1);
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-2-pro-preview",
      "test-key",
      { prompt: "fox at dawn" }
    );
  });

  it("keeps an accepted provider job recoverable when the caller disappears mid-request", async () => {
    const job = await seedJob();
    mocks.bflJson.mockResolvedValue({ id: "bfl-2", polling_url: "https://poll.example/bfl-2" });
    await submitQueueJob(job.id);

    // Simulate the HTTP handler being torn down: only the persisted store remains.
    clearJobRuntime(job.id);
    const stored = await readJob(job.id);
    expect(stored?.providerRequestId).toBe("bfl-2");
    expect(stored?.pollingUrl).toBe("https://poll.example/bfl-2");
    expect(stored?.status).toBe("running");
  });

  it("fails terminally without paying when the payload can no longer be built", async () => {
    const job = await seedJob();
    mocks.prepare.mockResolvedValue({ error: "Prompt is required", status: 400 });

    const outcome = await submitQueueJob(job.id);

    expect(outcome.ok).toBe(false);
    expect(mocks.bflJson).not.toHaveBeenCalled();
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.failureClass).toBe("terminal");
  });

  it("retries a 429 with backoff instead of failing the job", async () => {
    const job = await seedJob();
    mocks.bflJson.mockRejectedValue(new Error('BFL API 429: {"detail":"slow down"}'));

    const outcome = await submitQueueJob(job.id);

    expect(outcome.status).toBe("queued");
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("queued");
    expect(stored?.retryCount).toBe(1);
    expect(stored?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(stored?.failureClass).toBe("retryable");
  });

  it("pauses the whole queue before another paid submit when credits run out", async () => {
    const job = await seedJob();
    mocks.bflJson.mockRejectedValue(new Error('BFL API 402: {"detail":"insufficient credits"}'));

    await submitQueueJob(job.id);

    const state = await readQueueState();
    expect(state.paused).toBe(true);
    expect(state.pauseReason).toMatch(/insufficient credits/i);
    expect(findQueueJob(state, job.id)?.status).toBe("failed");
    expect(findQueueJob(state, job.id)?.retryCount ?? 0).toBe(0);
  });
});

describe("provider lifecycle: poll step", () => {
  it("performs exactly one poll and schedules the next one", async () => {
    const job = await seedJob({
      status: "running",
      pollingUrl: "https://poll.example/bfl-3",
      providerRequestId: "bfl-3",
      submittedAt: Date.now()
    });
    mocks.bflJson.mockResolvedValue({ status: "Pending" });

    const outcome = await pollQueueJobStep(job.id);

    expect(mocks.bflJson).toHaveBeenCalledTimes(1);
    expect(mocks.bflJson).toHaveBeenCalledWith("GET", "https://poll.example/bfl-3", "test-key");
    expect(outcome.ready).toBe(false);
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("running");
    expect(stored?.pollCount).toBe(1);
    expect(stored?.nextPollAt).toBeGreaterThan(Date.now());
  });

  it("moves a Ready result into downloading", async () => {
    const job = await seedJob({
      status: "running",
      pollingUrl: "https://poll.example/bfl-4",
      providerRequestId: "bfl-4",
      submittedAt: Date.now()
    });
    setJobRuntime({
      jobId: job.id,
      kind: "image",
      operation: "generate",
      body: { prompt: "fox at dawn" },
      prepared: preparedOperation(),
      marks: { requestStartedAt: Date.now() }
    });
    mocks.bflJson.mockResolvedValue({ status: "Ready", result: { sample: "https://delivery.example/1.png" } });

    const outcome = await pollQueueJobStep(job.id);

    expect(outcome.ready).toBe(true);
    expect((await readJob(job.id))?.status).toBe("downloading");
  });

  it("never auto-retries a moderated result", async () => {
    const job = await seedJob({
      status: "running",
      pollingUrl: "https://poll.example/bfl-5",
      providerRequestId: "bfl-5",
      submittedAt: Date.now()
    });
    mocks.bflJson.mockResolvedValue({ status: "Content Moderated" });

    const outcome = await pollQueueJobStep(job.id);

    expect(outcome.failureClass).toBe("moderated");
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.retryCount ?? 0).toBe(0);
  });

  it("stops polling past the provider budget without resubmitting a paid request", async () => {
    const job = await seedJob({
      status: "running",
      pollingUrl: "https://poll.example/bfl-6",
      providerRequestId: "bfl-6",
      submittedAt: Date.now() - 400_000
    });

    const outcome = await pollQueueJobStep(job.id);

    expect(mocks.bflJson).not.toHaveBeenCalled();
    expect(outcome.message).toBe("Timed out waiting for BFL result");
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.failureClass).toBe("terminal");
    // The polling URL survives so the result can still be recovered by hand.
    expect(stored?.pollingUrl).toBe("https://poll.example/bfl-6");
  });
});

describe("provider lifecycle: finalize", () => {
  it("saves the artifact and reconciles cost and credit deltas", async () => {
    const job = await seedJob({
      status: "downloading",
      pollingUrl: "https://poll.example/bfl-7",
      providerRequestId: "bfl-7"
    });
    setJobRuntime({
      jobId: job.id,
      kind: "image",
      operation: "generate",
      body: { prompt: "fox at dawn" },
      apiKey: "test-key",
      creditsBefore: 100,
      prepared: {
        ...preparedOperation(),
        context: {
          submitted: { id: "bfl-7", cost: 6 },
          result: { status: "Ready", result: { sample: "https://delivery.example/7.png" } }
        }
      },
      marks: { requestStartedAt: Date.now() }
    });
    mocks.getCredits.mockResolvedValue(94);
    mocks.finalize.mockResolvedValue({
      response: { id: "bfl-7", imageDataUrl: "data:image/png;base64,AAA" },
      result: { mediaType: "image", assetId: "bfl-7", localPath: "outputs/7.png", metadataPath: "outputs/7.json" },
      timing: { durations: { submitMs: 10, providerMs: 20, downloadMs: 30, finalizeMs: 40, creditsMs: 5 } },
      actualCredits: 6
    });

    const outcome = await finalizeQueueJob(job.id);

    expect(outcome.ok).toBe(true);
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("complete");
    expect(stored?.resultAssetId).toBe("bfl-7");
    expect(stored?.actualCredits).toBe(6);
    expect(stored?.actualUsd).toBeCloseTo(0.06);
    expect(stored?.creditsAfter).toBe(94);
    expect(stored?.attempts?.at(-1)).toMatchObject({ status: "complete", providerRequestId: "bfl-7" });
    // Prepared media buffers are freed as soon as the artifact is on disk;
    // otherwise a long session pins every finished job's payload in memory.
    expect(getJobRuntime(job.id)?.prepared).toBeUndefined();
    // The response survives briefly so an awaiting wrapper request can read it.
    expect(getJobRuntime(job.id)?.response).toMatchObject({ id: "bfl-7" });
  });

  it("rebuilds the prepared request and still saves a paid result after a restart", async () => {
    const job = await seedJob({
      status: "downloading",
      pollingUrl: "https://poll.example/bfl-restart",
      providerRequestId: "bfl-restart",
      submittedCost: 6
    });
    // Simulate the restart: the in-memory runtime map is empty, only the store
    // and its sanitized descriptor survive.
    clearJobRuntime(job.id);
    mocks.bflJson.mockResolvedValue({ status: "Ready", result: { sample: "https://delivery.example/restart.png" } });
    mocks.getCredits.mockResolvedValue(94);
    mocks.finalize.mockResolvedValue({
      response: { id: "bfl-restart" },
      result: { mediaType: "image", assetId: "bfl-restart", localPath: "outputs/restart.png" },
      timing: { durations: {} },
      actualCredits: 6
    });

    const outcome = await finalizeQueueJob(job.id);

    expect(outcome.ok).toBe(true);
    // The saver ran: the paid artifact is not stranded.
    expect(mocks.finalize).toHaveBeenCalledTimes(1);
    // Cost reconciliation survives the restart through the persisted submit cost.
    expect(mocks.finalize.mock.calls[0][0].submitted).toMatchObject({ id: "bfl-restart", cost: 6 });
    const stored = await readJob(job.id);
    expect(stored?.status).toBe("complete");
    expect(stored?.resultAssetId).toBe("bfl-restart");
    // Nothing was re-submitted to reach this point.
    expect(mocks.bflJson.mock.calls.every(([method]) => method === "GET")).toBe(true);
  });

  it("refuses to finalize when the media inputs were never persisted, instead of guessing", async () => {
    const job = await seedJob({ status: "downloading", pollingUrl: "https://poll.example/bfl-8" });
    await mutateQueueState((state) => {
      state.descriptors[job.id].recoverable = false;
    });
    clearJobRuntime(job.id);

    const outcome = await finalizeQueueJob(job.id);

    expect(outcome.ok).toBe(false);
    expect((await readJob(job.id))?.failureClass).toBe("terminal");
    expect((await readJob(job.id))?.error).toMatch(/never persisted/i);
  });
});

describe("an accepted provider job is never paid for twice", () => {
  it("resumes polling instead of re-queueing when a poll fails retryably", async () => {
    const job = await seedJob({
      status: "running",
      pollingUrl: "https://poll.example/bfl-blip",
      providerRequestId: "bfl-blip",
      submittedAt: Date.now()
    });
    mocks.bflJson.mockRejectedValue(new Error('BFL API 503: {"detail":"upstream"}'));

    const outcome = await pollQueueJobStep(job.id);

    expect(outcome.status).toBe("running");
    const stored = await readJob(job.id);
    // "queued" would make the scheduler submit — and pay — a second time.
    expect(stored?.status).toBe("running");
    expect(stored?.providerRequestId).toBe("bfl-blip");
    expect(stored?.pollingUrl).toBe("https://poll.example/bfl-blip");
    expect(stored?.nextPollAt).toBeGreaterThan(Date.now());
    expect(stored?.nextRetryAt).toBeUndefined();
    expect(stored?.retryCount).toBe(1);
    expect(stored?.recovery?.at(-1)?.detail).toMatch(/resuming polling, not resubmitting/i);
  });

  it("resumes polling instead of re-queueing when the download fails retryably", async () => {
    const job = await seedJob({
      status: "downloading",
      pollingUrl: "https://poll.example/bfl-dl",
      providerRequestId: "bfl-dl"
    });
    setJobRuntime({
      jobId: job.id,
      kind: "image",
      operation: "generate",
      body: { prompt: "fox at dawn" },
      apiKey: "test-key",
      prepared: {
        ...preparedOperation(),
        context: {
          submitted: { id: "bfl-dl" },
          result: { status: "Ready", result: { sample: "https://delivery.example/dl.png" } }
        }
      },
      marks: { requestStartedAt: Date.now() }
    });
    mocks.finalize.mockRejectedValue(new Error("fetch failed"));

    await finalizeQueueJob(job.id);

    const stored = await readJob(job.id);
    expect(stored?.status).toBe("running");
    expect(stored?.providerRequestId).toBe("bfl-dl");
  });

  it("refuses a direct submit of a job that already reached the provider", async () => {
    const job = await seedJob({
      status: "running",
      pollingUrl: "https://poll.example/bfl-guard",
      providerRequestId: "bfl-guard"
    });

    const outcome = await submitQueueJob(job.id);

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/already reached BFL/i);
    expect(mocks.bflJson).not.toHaveBeenCalled();
  });

  it("still re-queues a submit-phase failure, because nothing was accepted", async () => {
    const job = await seedJob();
    mocks.bflJson.mockRejectedValue(new Error('BFL API 429: {"detail":"slow down"}'));

    await submitQueueJob(job.id);

    const stored = await readJob(job.id);
    expect(stored?.status).toBe("queued");
    expect(stored?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(stored?.providerRequestId).toBeUndefined();
  });
});

describe("source quarantine", () => {
  it("quarantines a source after repeated terminal failures so the rest of a batch is skipped", async () => {
    const first = await seedJob({ id: "quar-1", sourceFingerprint: "bad-source" });
    const second = await seedJob({ id: "quar-2", sourceFingerprint: "bad-source" });
    mocks.prepare.mockResolvedValue({ error: "Corrupt source image", status: 422 });

    await submitQueueJob(first.id);
    let state = await readQueueState();
    expect(state.quarantine.find((entry) => entry.fingerprint === "bad-source")?.failures).toBe(1);

    await submitQueueJob(second.id);
    state = await readQueueState();
    expect(state.quarantine.find((entry) => entry.fingerprint === "bad-source")?.failures).toBe(2);
    expect(state.quarantine.find((entry) => entry.fingerprint === "bad-source")?.quarantinedAt).toBeGreaterThan(0);
  });
});
