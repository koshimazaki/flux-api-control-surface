import { describe, expect, it } from "vitest";
import {
  approximatePromptTokens,
  normalizeEvaluationAnnotation,
  sanitizeEvaluationSettings
} from "@/lib/generation-evaluation";

describe("generation evaluation normalization", () => {
  it("normalizes review values and bounds user-authored fields", () => {
    expect(normalizeEvaluationAnnotation({
      rating: 9,
      verdict: "keep",
      tags: ["motion", "motion", " lighting "],
      notes: " useful "
    })).toMatchObject({ rating: 5, verdict: "keep", tags: ["motion", "lighting"], notes: "useful" });
  });

  it("removes secrets and binary media from captured settings", () => {
    expect(sanitizeEvaluationSettings({
      prompt: "fox at dawn",
      apiKey: "secret",
      input_image: "base64",
      nested: { authorization: "bearer", duration: 8 }
    })).toEqual({ prompt: "fox at dawn", nested: { duration: 8 } });
  });

  it("provides a stable lightweight prompt-token approximation", () => {
    expect(approximatePromptTokens("")).toBe(0);
    expect(approximatePromptTokens("12345678")).toBe(2);
  });
});
