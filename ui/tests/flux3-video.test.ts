import { describe, expect, it } from "vitest";
import {
  buildFlux3VideoPayload,
  estimateFlux3VideoUsd,
  flux3RequestBlocker,
  redactFlux3Payload
} from "@/lib/flux3-video";

describe("FLUX.3 video request helpers", () => {
  it("builds the documented text-to-video request with audio defaults", () => {
    expect(buildFlux3VideoPayload({ mode: "t2v", prompt: "fox through dawn mist" })).toEqual({
      mode: "t2v",
      prompt: "fox through dawn mist",
      aspect_ratio: "auto",
      duration: "auto",
      resolution: "hd",
      generate_audio: true,
      safety_tolerance: 2,
      draft: false
    });
  });

  it("requires a fixed duration for three or more keyframes", () => {
    expect(
      flux3RequestBlocker({ mode: "i2v", prompt: "move through these frames", keyframes: ["a", "b", "c"], duration: "auto" })
    ).toMatch(/set a duration/i);
    expect(
      flux3RequestBlocker({ mode: "i2v", prompt: "move through these frames", keyframes: ["a", "b", "c"], duration: 8 })
    ).toBeNull();
  });

  it("applies the shorter continuation limit and conditioning safety limit", () => {
    expect(flux3RequestBlocker({ mode: "v2v", prompt: "continue", startVideo: "clip", duration: 16 })).toMatch(/5 to 15/);
    expect(
      flux3RequestBlocker({ mode: "v2v", prompt: "continue", startVideo: "clip", duration: 8, safetyTolerance: 3 })
    ).toMatch(/0 and 2/);
  });

  it("builds a deterministic draft enhancement payload", () => {
    expect(
      buildFlux3VideoPayload({ mode: "draft_enhance", draftCache: "encrypted-cache", resolution: "fhd" })
    ).toEqual({
      mode: "draft_enhance",
      draft_cache: "encrypted-cache",
      resolution: "fhd",
      safety_tolerance: 2
    });
  });

  it("estimates documented per-second pricing", () => {
    expect(estimateFlux3VideoUsd({ mode: "t2v", prompt: "x", duration: 10, resolution: "fhd" })).toBeCloseTo(2.9);
    expect(estimateFlux3VideoUsd({ mode: "i2v", prompt: "x", keyframes: ["a"], duration: 10, draft: true })).toBeCloseTo(0.6);
    expect(estimateFlux3VideoUsd({ mode: "v2v", prompt: "x", startVideo: "a", duration: 10, resolution: "hd" })).toBeCloseTo(4.3);
  });

  it("redacts conditioning media without redacting the prompt", () => {
    expect(
      redactFlux3Payload({ prompt: "keep this", keyframes: ["large-a", "large-b"], start_video: "huge-video" })
    ).toEqual({
      prompt: "keep this",
      keyframes: "[2 image keyframes omitted]",
      start_video: "[video input omitted]"
    });
  });
});
