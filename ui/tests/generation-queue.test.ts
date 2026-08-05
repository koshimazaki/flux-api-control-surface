import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL_GENERATION_CONCURRENCY,
  GENERATION_QUEUE_CONCURRENCY,
  availableGenerationSlots,
  generationDependencyState,
  selectRunnableGenerationJobs,
  summarizeGenerationQueue,
  type GenerationQueueJob
} from "@/lib/generation-queue";

function job(
  id: string,
  status: GenerationQueueJob["status"],
  overrides: Partial<GenerationQueueJob> = {}
): GenerationQueueJob {
  return {
    id,
    kind: "image",
    lane: "image",
    operation: "generate",
    title: id,
    status,
    createdAt: 1,
    batchIndex: 1,
    batchTotal: 1,
    promptTokens: 10,
    estimatedCredits: 1,
    ...overrides
  };
}

describe("generation queue helpers", () => {
  it("keeps legacy browser throughput separate from the future server default", () => {
    expect(GENERATION_QUEUE_CONCURRENCY).toBe(10);
    expect(DEFAULT_GLOBAL_GENERATION_CONCURRENCY).toBe(4);
  });

  it("summarizes queued, running, and settled jobs", () => {
    const summary = summarizeGenerationQueue([
      job("queued", "queued"),
      job("running", "running"),
      job("complete", "complete"),
      job("failed", "failed")
    ]);

    expect(summary).toEqual({
      total: 4,
      queued: 1,
      waiting: 0,
      paused: 0,
      submitting: 0,
      running: 1,
      downloading: 0,
      complete: 1,
      failed: 1,
      cancelled: 0,
      active: 2,
      inFlight: 1
    });
  });

  it("caps available concurrent slots at the configured limit", () => {
    expect(availableGenerationSlots(3, 10)).toBe(7);
    expect(availableGenerationSlots(12, 10)).toBe(0);
  });

  it("reports ready, waiting, and blocked dependency states", () => {
    const complete = job("image", "complete", { resultAssetId: "asset-image" });
    const running = job("mask", "running");
    const failed = job("failed", "failed");

    expect(generationDependencyState(job("video", "queued", { dependsOn: [complete.id] }), [complete])).toMatchObject({
      state: "ready"
    });
    expect(generationDependencyState(job("video", "queued", { dependsOn: [running.id] }), [running])).toMatchObject({
      state: "waiting"
    });
    expect(generationDependencyState(job("video", "queued", { dependsOn: [failed.id] }), [failed])).toMatchObject({
      state: "blocked"
    });
    expect(
      generationDependencyState(job("video", "queued", { dependsOn: ["empty"] }), [job("empty", "complete")])
    ).toMatchObject({ state: "blocked" });
  });

  it("selects jobs by global capacity, lane capacity, dependency readiness, and priority", () => {
    const runningVideo = job("running-video", "running", { kind: "video", lane: "video" });
    const image = job("image", "queued", { priority: 1, createdAt: 2 });
    const tool = job("tool", "queued", { kind: "tool", lane: "tool", createdAt: 3 });
    const video = job("video", "queued", { kind: "video", lane: "video", priority: 2, createdAt: 4 });
    const waiting = job("dependent", "waiting", { kind: "video", lane: "video", dependsOn: [image.id] });

    expect(
      selectRunnableGenerationJobs([runningVideo, image, tool, video, waiting], {
        globalLimit: 4,
        laneLimits: { image: 2, tool: 1, video: 1 }
      }).map((item) => item.id)
    ).toEqual(["image", "tool"]);
  });

  it("holds retries until their scheduled time", () => {
    const delayed = job("delayed", "queued", { nextRetryAt: 200 });
    const ready = job("ready", "queued", { createdAt: 2 });

    expect(selectRunnableGenerationJobs([delayed, ready], { globalLimit: 2, now: 100 }).map((item) => item.id)).toEqual([
      "ready"
    ]);
  });
});
