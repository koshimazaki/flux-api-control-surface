import { describe, expect, it } from "vitest";
import {
  audioWindowDefaultSeconds,
  audioWindowFitLabel,
  audioWindowFluxMaxSeconds,
  audioWindowMaxSeconds,
  audioWindowStepSeconds,
  audioWindowSteps
} from "@/lib/audio-script";
import { flux3MaxDuration } from "@/lib/flux3-video";

describe("audio analysis window", () => {
  it("reaches the longest clip we can generate", () => {
    // The regression this guards: the window was pinned at 15s while FLUX.3
    // generates 20s and Seedance 2.5 generates 30s, so the tail of a full-length
    // clip had no markers behind it.
    expect(audioWindowMaxSeconds).toBe(30);
    expect(audioWindowMaxSeconds).toBeGreaterThanOrEqual(flux3MaxDuration("t2v"));
  });

  it("tracks the FLUX.3 ceiling from the model module rather than a literal", () => {
    expect(audioWindowFluxMaxSeconds).toBe(flux3MaxDuration("t2v"));
  });

  it("defaults to a full FLUX.3 clip", () => {
    expect(audioWindowDefaultSeconds).toBe(flux3MaxDuration("t2v"));
    expect(audioWindowDefaultSeconds).toBeLessThanOrEqual(audioWindowMaxSeconds);
  });

  it("steps in the increments shots are chopped at", () => {
    expect(audioWindowStepSeconds).toBe(5);
    expect(audioWindowSteps).toEqual([5, 10, 15, 20, 25, 30]);
    expect(audioWindowSteps.every((step) => step % audioWindowStepSeconds === 0)).toBe(true);
    expect(audioWindowSteps.at(-1)).toBe(audioWindowMaxSeconds);
  });

  it("includes both model ceilings as selectable steps", () => {
    expect(audioWindowSteps).toContain(audioWindowFluxMaxSeconds);
    expect(audioWindowSteps).toContain(audioWindowMaxSeconds);
  });

  it("names what a given window actually covers", () => {
    expect(audioWindowFitLabel(20)).toBe("20s · full FLUX.3 clip");
    expect(audioWindowFitLabel(30)).toBe("30s · Seedance 2.5");
    expect(audioWindowFitLabel(10)).toBe("10s · partial clip");
  });
});
