import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { queueDir } from "@/lib/queue/paths";
import { recoverOrphanedJobs } from "@/lib/queue/recovery";
import { findQueueJob, mutateQueueState, readQueueState } from "@/lib/queue/store";
import { clearJobRuntime } from "@/lib/queue/runtime";
import type { ServerQueueJob } from "@/lib/queue/types";

type SeedOptions = Partial<ServerQueueJob> & { recoverable?: boolean };

async function seed(id: string, options: SeedOptions) {
  const { recoverable = true, ...overrides } = options;
  await mutateQueueState((state) => {
    state.jobs.push({
      id,
      kind: "image",
      lane: "image",
      operation: "generate",
      title: id,
      status: "running",
      createdAt: 1,
      queuedAt: 1,
      ...overrides
    } as ServerQueueJob);
    state.descriptors[id] = {
      jobId: id,
      kind: "image",
      operation: "generate",
      body: { prompt: "fox at dawn" },
      recoverable
    };
  });
  clearJobRuntime(id);
}

beforeEach(async () => {
  await rm(queueDir(), { recursive: true, force: true });
});

describe("restart recovery", () => {
  it("resumes polling from the persisted request id and polling URL", async () => {
    await seed("resume-1", {
      status: "running",
      providerRequestId: "bfl-resume",
      pollingUrl: "https://poll.example/bfl-resume",
      submittedAt: 10
    });

    const report = await recoverOrphanedJobs({ activeJobIds: new Set() });

    expect(report.resumed).toEqual(["resume-1"]);
    const job = findQueueJob(await readQueueState(), "resume-1");
    expect(job?.status).toBe("running");
    expect(job?.pollingUrl).toBe("https://poll.example/bfl-resume");
    expect(job?.nextPollAt).toBeGreaterThan(0);
    expect(job?.recovery?.at(-1)?.event).toBe("restart-resume");
  });

  it("resumes a job that was mid-download when the process died", async () => {
    await seed("resume-2", {
      status: "downloading",
      providerRequestId: "bfl-download",
      pollingUrl: "https://poll.example/bfl-download"
    });

    await recoverOrphanedJobs({ activeJobIds: new Set() });

    expect(findQueueJob(await readQueueState(), "resume-2")?.status).toBe("running");
  });

  it("never resubmits a request that was interrupted before acceptance", async () => {
    await seed("abandon-1", { status: "submitting" });

    const report = await recoverOrphanedJobs({ activeJobIds: new Set() });

    expect(report.abandoned).toEqual(["abandon-1"]);
    const job = findQueueJob(await readQueueState(), "abandon-1");
    expect(job?.status).toBe("failed");
    expect(job?.failureClass).toBe("terminal");
    // "submitting" is exactly the window where the POST may have succeeded
    // before the write-back died, so the message must not promise it was free.
    expect(job?.error).toMatch(/may still have reached BFL/i);
    expect(job?.error).toMatch(/paid for twice/i);
  });

  it("explains, rather than silently retries, an accepted job whose media was never persisted", async () => {
    await seed("abandon-2", {
      status: "running",
      providerRequestId: "bfl-media",
      pollingUrl: "https://poll.example/bfl-media",
      recoverable: false
    });

    await recoverOrphanedJobs({ activeJobIds: new Set() });

    const job = findQueueJob(await readQueueState(), "abandon-2");
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("bfl-media");
    // The polling URL is retained so /api/bfl/jobs can still recover the result.
    expect(job?.pollingUrl).toBe("https://poll.example/bfl-media");
  });

  it("leaves jobs this process is already running alone", async () => {
    await seed("active-1", {
      status: "running",
      providerRequestId: "bfl-active",
      pollingUrl: "https://poll.example/bfl-active",
      nextPollAt: 999
    });

    const report = await recoverOrphanedJobs({ activeJobIds: new Set(["active-1"]) });

    expect(report).toEqual({ resumed: [], abandoned: [] });
    expect(findQueueJob(await readQueueState(), "active-1")?.nextPollAt).toBe(999);
  });

  it("records a lease takeover when another runner's work is adopted", async () => {
    await seed("takeover-1", {
      status: "running",
      providerRequestId: "bfl-takeover",
      pollingUrl: "https://poll.example/bfl-takeover"
    });

    await recoverOrphanedJobs({ activeJobIds: new Set(), tookOver: true });

    expect(findQueueJob(await readQueueState(), "takeover-1")?.recovery?.at(-1)?.event).toBe("lease-takeover");
  });
});
