import { describe, expect, it } from "vitest";
import { buildGenerationTiming } from "@/lib/generation-capture";

describe("generation capture timing", () => {
  it("records lifecycle timestamps and non-negative phase durations", () => {
    const timing = buildGenerationTiming({
      requestStartedAt: 1_000,
      submitStartedAt: 1_100,
      providerAcceptedAt: 1_160,
      providerReadyAt: 2_160,
      downloadStartedAt: 2_200,
      downloadedAt: 2_450,
      capturedAt: 2_500
    });

    expect(timing).toMatchObject({
      requestStartedAt: "1970-01-01T00:00:01.000Z",
      capturedAt: "1970-01-01T00:00:02.500Z",
      durations: {
        prepareMs: 100,
        submitMs: 60,
        providerMs: 1000,
        downloadMs: 250,
        finalizeMs: 50,
        totalMs: 1500
      }
    });
  });

  it("measures finalize after the artifact is saved instead of leaving it ~0", () => {
    const timing = buildGenerationTiming({
      requestStartedAt: 1_000,
      submitStartedAt: 1_100,
      providerAcceptedAt: 1_160,
      providerReadyAt: 2_160,
      downloadStartedAt: 2_200,
      downloadedAt: 2_450,
      savedAt: 2_900,
      capturedAt: 2_910
    });

    expect(timing.savedAt).toBe("1970-01-01T00:00:02.900Z");
    expect(timing.durations.finalizeMs).toBe(450);
    expect(timing.durations.downloadMs).toBe(250);
  });

  it("buckets the credit probe on its own so prepare and download stay comparable", () => {
    const timing = buildGenerationTiming({
      requestStartedAt: 1_000,
      submitStartedAt: 1_300,
      providerAcceptedAt: 1_360,
      providerReadyAt: 2_360,
      downloadStartedAt: 2_400,
      downloadedAt: 2_650,
      savedAt: 2_700,
      capturedAt: 2_700,
      creditsBeforeMs: 180,
      creditsAfterMs: 20
    });

    expect(timing.durations.creditsMs).toBe(200);
    // 300ms prepare window minus the 180ms credit probe inside it.
    expect(timing.durations.prepareMs).toBe(120);
    expect(timing.durations.downloadMs).toBe(250);
  });

  it("records how long a job waited in the queue before execution started", () => {
    const timing = buildGenerationTiming({
      queuedAt: 500,
      requestStartedAt: 1_000,
      submitStartedAt: 1_100,
      capturedAt: 1_200
    });

    expect(timing.queuedAt).toBe("1970-01-01T00:00:00.500Z");
    expect(timing.durations.queueWaitMs).toBe(500);
  });
});
