import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EVALUATION_ANNOTATION } from "@/lib/generation-evaluation";
import { unsuccessfulQueueEvaluations } from "@/lib/queue/evaluation";
import { queueDir } from "@/lib/queue/paths";
import { mutateQueueState } from "@/lib/queue/store";
import type { ServerQueueJob } from "@/lib/queue/types";

function seed(job: Partial<ServerQueueJob> & { id: string }) {
  return mutateQueueState((state) => {
    state.jobs.push({
      kind: "image",
      lane: "image",
      operation: "generate",
      title: job.id,
      status: "failed",
      createdAt: 1_000,
      queuedAt: 1_000,
      ...job
    } as ServerQueueJob);
  });
}

beforeEach(async () => {
  await rm(queueDir(), { recursive: true, force: true });
});

describe("queue attempts in the bfl-evaluation/v1 read model", () => {
  it("exposes a failed attempt with its failure class, retries, and queue wait", async () => {
    await seed({
      id: "job-failed",
      providerRequestId: "bfl-failed",
      title: "moderated flower",
      model: "pro-preview",
      failureClass: "moderated",
      error: "FLUX generation failed: Content Moderated",
      retryCount: 0,
      queueWaitMs: 1_250,
      finishedAt: 5_000,
      estimatedCredits: 6,
      attempts: [{ attempt: 1, startedAt: 1_000, endedAt: 5_000, status: "failed", failureClass: "moderated" }],
      recovery: [{ at: 4_000, event: "restart-resume" }]
    });

    const [record] = await unsuccessfulQueueEvaluations({});

    expect(record.schemaVersion).toBe("bfl-evaluation/v1");
    expect(record.id).toBe("bfl-failed");
    expect(record.status).toBe("failed");
    expect(record.failureClass).toBe("moderated");
    expect(record.error).toMatch(/Content Moderated/);
    expect(record.queue).toMatchObject({ jobId: "job-failed", queueWaitMs: 1_250, retryCount: 0 });
    expect(record.queue?.attempts).toHaveLength(1);
    expect(record.queue?.recovery).toHaveLength(1);
    expect(record.annotation).toEqual(DEFAULT_EVALUATION_ANNOTATION);
  });

  it("marks cancelled work distinctly and keeps video jobs on the video media type", async () => {
    await seed({ id: "job-cancelled", kind: "video", lane: "video", operation: "i2v", status: "cancelled" });

    const [record] = await unsuccessfulQueueEvaluations({});

    expect(record.status).toBe("cancelled");
    expect(record.mediaType).toBe("video");
    expect(record.model).toBe("flux-3-video");
  });

  it("ignores complete and in-flight jobs, which the saved-metadata scan already covers", async () => {
    await seed({ id: "job-complete", status: "complete" });
    await seed({ id: "job-running", status: "running" });

    expect(await unsuccessfulQueueEvaluations({})).toEqual([]);
  });
});
