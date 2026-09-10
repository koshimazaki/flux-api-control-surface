import { describe, expect, it } from "vitest";
import {
  VIDEO_EDIT_PROMPT_MAX_CHARS,
  VIDEO_EDIT_PROMPT_STARTERS,
  buildVideoEditPayload,
  estimateVideoEditUsd,
  redactVideoEditPayload,
  videoEditRequestBlocker
} from "@/lib/video-edit";

describe("FLUX Video Edit request helpers", () => {
  it("builds exactly the documented payload with defaults", () => {
    expect(buildVideoEditPayload({ inputVideo: "base64-video", prompt: "  Remove the orange bucket.  " })).toEqual({
      video: "base64-video",
      prompt: "Remove the orange bucket.",
      safety_tolerance: 2
    });
  });

  it("passes an explicit safety tolerance through", () => {
    expect(buildVideoEditPayload({ inputVideo: "clip", prompt: "Make the apron red.", safetyTolerance: 1 })).toEqual({
      video: "clip",
      prompt: "Make the apron red.",
      safety_tolerance: 1
    });
  });

  it("requires a clip and an instruction", () => {
    expect(videoEditRequestBlocker({ inputVideo: "", prompt: "x" })).toMatch(/mp4 clip/i);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "   " })).toMatch(/describe the change/i);
    expect(() => buildVideoEditPayload({ inputVideo: "x", prompt: "" })).toThrow(/describe the change/i);
  });

  it("guards prompt length, file size, duration, frame count, resolution, and safety", () => {
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "a".repeat(VIDEO_EDIT_PROMPT_MAX_CHARS + 1) })).toMatch(/4,096/);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", sourceBytes: 51 * 1024 * 1024 })).toMatch(/50 MB/i);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", durationSeconds: 16 })).toMatch(/15 seconds/i);
    // FLUX 3's own 15 s continuations report container durations slightly over 15.
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", durationSeconds: 15.4 })).toBeNull();
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", durationSeconds: 15.6 })).toMatch(/15 seconds/i);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", durationSeconds: 0.5 })).toMatch(/17 frames/i);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", sourceWidth: 120, sourceHeight: 720 })).toMatch(/160 pixels/i);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", safetyTolerance: 5 })).toMatch(/between 0 and 4/i);
    expect(videoEditRequestBlocker({ inputVideo: "x", prompt: "ok", durationSeconds: 8, sourceWidth: 1920, sourceHeight: 1080 })).toBeNull();
  });

  it("estimates the documented $0.03 per output second", () => {
    expect(estimateVideoEditUsd({ durationSeconds: 10 })).toBeCloseTo(0.3, 2);
    expect(estimateVideoEditUsd({ durationSeconds: 8 })).toBeCloseTo(0.24, 2);
    expect(estimateVideoEditUsd({})).toBeNull();
  });

  it("redacts the source clip but keeps the instruction", () => {
    expect(redactVideoEditPayload({ video: "large-video", prompt: "keep", safety_tolerance: 2 })).toEqual({
      video: "[video input omitted]",
      prompt: "keep",
      safety_tolerance: 2
    });
  });

  it("offers prompt starters that are valid instructions on their own", () => {
    expect(VIDEO_EDIT_PROMPT_STARTERS.length).toBeGreaterThanOrEqual(6);
    for (const starter of VIDEO_EDIT_PROMPT_STARTERS) {
      expect(starter.label.length).toBeLessThanOrEqual(12);
      expect(videoEditRequestBlocker({ inputVideo: "x", prompt: starter.prompt })).toBeNull();
    }
  });
});
