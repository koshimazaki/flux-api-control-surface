import { describe, expect, it } from "vitest";
import {
  QUEUE_BREAKER_COOLDOWN_MS,
  QUEUE_BREAKER_THRESHOLD,
  QUEUE_RETRY_CEILING_MS,
  breakerIsOpen,
  classifyProviderFailure,
  computeRetryDelayMs,
  nextBreakerState,
  pausesQueue,
  providerStatusFromMessage,
  shouldRetry,
  sourceFingerprint
} from "@/lib/queue/failures";

describe("provider failure taxonomy", () => {
  it("treats 408/429/5xx and transient network errors as retryable", () => {
    expect(classifyProviderFailure({ message: 'BFL API 429: {"detail":"slow down"}' })).toBe("retryable");
    expect(classifyProviderFailure({ message: 'BFL API 503: {"detail":"upstream"}' })).toBe("retryable");
    expect(classifyProviderFailure({ message: "BFL API 408: {}" })).toBe("retryable");
    expect(classifyProviderFailure({ message: "fetch failed" })).toBe("retryable");
  });

  it("treats validation and other 4xx responses as terminal input", () => {
    expect(classifyProviderFailure({ message: 'BFL API 422: {"detail":"bad image"}' })).toBe("terminal");
    expect(classifyProviderFailure({ status: 400, message: "Prompt is required" })).toBe("terminal");
  });

  it("classifies moderation from the provider poll status", () => {
    expect(classifyProviderFailure({ providerStatus: "Content Moderated" })).toBe("moderated");
    expect(classifyProviderFailure({ providerStatus: "Request Moderated" })).toBe("moderated");
    expect(classifyProviderFailure({ message: "FLUX generation failed: Content Moderated" })).toBe("moderated");
  });

  it("classifies credit and authentication problems so the queue can pause", () => {
    expect(classifyProviderFailure({ message: "BFL API 402: {}" })).toBe("credits");
    expect(classifyProviderFailure({ message: "Insufficient credits for this request" })).toBe("credits");
    expect(classifyProviderFailure({ message: "BFL API 401: {}" })).toBe("auth");
    expect(classifyProviderFailure({ message: "FLUX API key is required" })).toBe("auth");
    expect(pausesQueue("credits")).toBe(true);
    expect(pausesQueue("auth")).toBe(true);
    expect(pausesQueue("moderated")).toBe(false);
  });

  it("reads the HTTP status back out of a bflJson error message", () => {
    expect(providerStatusFromMessage('BFL API 500: {"detail":"boom"}')).toBe(500);
    expect(providerStatusFromMessage("network unreachable")).toBeUndefined();
  });

  it("only auto-retries retryable failures, and only within the retry budget", () => {
    expect(shouldRetry("retryable", 0)).toBe(true);
    expect(shouldRetry("retryable", 3)).toBe(false);
    expect(shouldRetry("moderated", 0)).toBe(false);
    expect(shouldRetry("terminal", 0)).toBe(false);
    expect(shouldRetry("credits", 0)).toBe(false);
    expect(shouldRetry("auth", 0)).toBe(false);
  });
});

describe("retry backoff", () => {
  it("grows exponentially with jitter and stays under the ceiling", () => {
    expect(computeRetryDelayMs(0, () => 0)).toBe(1_500);
    expect(computeRetryDelayMs(1, () => 0)).toBe(3_000);
    expect(computeRetryDelayMs(2, () => 0)).toBe(6_000);
    expect(computeRetryDelayMs(1, () => 1)).toBe(3_750);
    expect(computeRetryDelayMs(20, () => 1)).toBeLessThanOrEqual(QUEUE_RETRY_CEILING_MS);
  });
});

describe("source quarantine fingerprints", () => {
  it("is stable per operation and source set, and order independent", () => {
    const left = sourceFingerprint({ kind: "video", operation: "i2v", sourceAssetIds: ["b", "a"] });
    const right = sourceFingerprint({ kind: "video", operation: "i2v", sourceAssetIds: ["a", "b"] });
    expect(left).toBe(right);
    expect(sourceFingerprint({ kind: "video", operation: "t2v", sourceAssetIds: ["a", "b"] })).not.toBe(left);
  });

  it("returns nothing when a job has no identifiable source", () => {
    expect(sourceFingerprint({ kind: "image", operation: "generate", sourceAssetIds: [] })).toBeUndefined();
  });
});

describe("lane circuit breaker", () => {
  it("opens after repeated provider-wide retryable failures and closes on success", () => {
    let state = { failures: 0 };
    for (let index = 0; index < QUEUE_BREAKER_THRESHOLD - 1; index += 1) {
      state = nextBreakerState(state, "retryable", 1_000);
      expect(breakerIsOpen(state, 1_000)).toBe(false);
    }
    const opened = nextBreakerState(state, "retryable", 1_000);
    expect(breakerIsOpen(opened, 1_000)).toBe(true);
    expect(breakerIsOpen(opened, 1_000 + QUEUE_BREAKER_COOLDOWN_MS + 1)).toBe(false);
    expect(nextBreakerState(opened, "terminal", 2_000)).toEqual({ failures: 0 });
  });
});
