import { describe, expect, it } from "vitest";
import {
  buildVideoUpscalePayload,
  estimateVideoUpscaleUsd,
  redactVideoUpscalePayload,
  videoUpscaleOutputSize,
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
    // FLUX 3's own 20 s renders report container durations slightly over 20.
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", durationSeconds: 20.4 })).toBeNull();
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", durationSeconds: 20.6 })).toMatch(/20 seconds/i);
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", sourceBytes: 51 * 1024 * 1024 })).toMatch(/50 MB/i);
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", sourceWidth: 2560, sourceHeight: 1440, upscaleFactor: 2 })).toBeNull();
  });

  it("estimates precise and creative output-MP-second pricing", () => {
    const base = { inputVideo: "x", sourceWidth: 1280, sourceHeight: 720, durationSeconds: 10, upscaleFactor: 2 };
    expect(estimateVideoUpscaleUsd({ ...base, creativity: 0 })).toBeCloseTo(2.58, 2);
    expect(estimateVideoUpscaleUsd({ ...base, creativity: 1 })).toBeCloseTo(3.69, 2);
  });

  it("caps large outputs and estimates instead of rejecting a valid source", () => {
    const request = { inputVideo: "x", sourceWidth: 2560, sourceHeight: 1440, upscaleFactor: 3, durationSeconds: 20.4, creativity: 1 as const };
    expect(videoUpscaleRequestBlocker(request)).toBeNull();
    const output = videoUpscaleOutputSize(request)!;
    expect(output.width * output.height).toBeLessThanOrEqual(13750000);
    expect(output.width).toBeLessThan(7680);
    expect(estimateVideoUpscaleUsd(request)).toBe(27.5);
    expect(videoUpscaleRequestBlocker({ ...request, sourceWidth: 3840, sourceHeight: 2160 })).toMatch(/Downscale/);
    expect(buildVideoUpscalePayload({ inputVideo: "x", safetyTolerance: 7 }).safety_tolerance).toBe(7);
    expect(videoUpscaleRequestBlocker({ inputVideo: "x", safetyTolerance: 8 })).toMatch(/0 and 7/);
  });

  it("redacts source media but preserves settings", () => {
    expect(redactVideoUpscalePayload({ input_video: "large-video", upscale_factor: 2, prompt: "keep" })).toEqual({
      input_video: "[video input omitted]",
      upscale_factor: 2,
      prompt: "keep"
    });
  });
});
