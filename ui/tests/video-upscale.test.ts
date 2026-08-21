import { describe, expect, it } from "vitest";
import {
  buildVideoUpscalePayload,
  estimateVideoUpscaleUsd,
  redactVideoUpscalePayload,
  videoUpscaleRequestBlocker
} from "@/lib/video-upscale";

describe("FLUX 3 Video Upscale request helpers", () => {
  it("builds the documented payload defaults", () => {
    expect(buildVideoUpscalePayload({ inputVideo: "base64-video" })).toEqual({
      input_video: "base64-video",
      upscale_factor: 2,
      creativity: 1,
      safety_tolerance: 2
    });
  });

  it("supports precise recovery with optional prompt", () => {
    expect(buildVideoUpscalePayload({
      inputVideo: "clip",
      upscaleFactor: 2.5,
      creativity: 0,
      prompt: "recover textile weave",
      safetyTolerance: 1
    })).toEqual({
      input_video: "clip",
      upscale_factor: 2.5,
      creativity: 0,
      prompt: "recover textile weave",
      safety_tolerance: 1
    });
  });

  it("guards factor, duration, file size, and output megapixels", () => {
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", upscaleFactor: 3.1 })).toMatch(/between 1.5/i);
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", durationSeconds: 21 })).toMatch(/20 seconds/i);
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", sourceBytes: 51 * 1024 * 1024 })).toMatch(/50 MB/i);
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", sourceWidth: 2560, sourceHeight: 1440, upscaleFactor: 2 })).toMatch(/13.75 MP/i);
  });

  it("estimates precise and creative output-MP-second pricing", () => {
    const base = { inputVideo: "x", sourceWidth: 1280, sourceHeight: 720, durationSeconds: 10, upscaleFactor: 2 };
    expect(estimateVideoUpscaleUsd({ ...base, creativity: 0 })).toBeCloseTo(2.58, 2);
    expect(estimateVideoUpscaleUsd({ ...base, creativity: 1 })).toBeCloseTo(3.69, 2);
  });

  it("redacts source media but preserves settings", () => {
    expect(redactVideoUpscalePayload({ input_video: "large-video", upscale_factor: 2, prompt: "keep" })).toEqual({
      input_video: "[video input omitted]",
      upscale_factor: 2,
      prompt: "keep"
    });
  });
});
