import { describe, expect, it } from "vitest";
import { availableGenerationSlots, summarizeGenerationQueue, type GenerationQueueJob } from "@/lib/generation-queue";

function job(id: string, status: GenerationQueueJob["status"]): GenerationQueueJob {
  return {
    id,
    title: id,
    status,
    createdAt: 1,
    batchIndex: 1,
    batchTotal: 1,
    promptTokens: 10,
    estimatedCredits: 1
  };
}

describe("generation queue helpers", () => {
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
      running: 1,
      complete: 1,
      failed: 1,
      active: 2
    });
  });

  it("caps available concurrent slots at the configured limit", () => {
    expect(availableGenerationSlots(3, 10)).toBe(7);
    expect(availableGenerationSlots(12, 10)).toBe(0);
  });
});
