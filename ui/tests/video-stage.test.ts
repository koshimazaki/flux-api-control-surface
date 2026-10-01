import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_STAGE_ASPECT, videoStageStyle } from "@/lib/video-stage";

describe("shared video stage geometry", () => {
  it("hands the box the clip's own dimensions so playback is native", () => {
    expect(videoStageStyle({ width: 1920, height: 1080 })).toEqual({
      "--video-stage-aspect-w": "1920",
      "--video-stage-aspect-h": "1080"
    });
    // A portrait render must drive a portrait box rather than pillarbox inside 16:9.
    expect(videoStageStyle({ width: 1080, height: 1920 })).toEqual({
      "--video-stage-aspect-w": "1080",
      "--video-stage-aspect-h": "1920"
    });
  });

  it("falls back to the stylesheet default whenever dimensions are unknown or unusable", () => {
    // No override means the empty dropzone is the same box as a 16:9 result,
    // so switching tools or loading a clip never resizes the window.
    for (const aspect of [
      undefined,
      null,
      {},
      { width: 1920 },
      { height: 1080 },
      { width: 0, height: 1080 },
      { width: 1920, height: 0 },
      { width: Number.NaN, height: 1080 },
      { width: -1920, height: 1080 },
      { width: Number.POSITIVE_INFINITY, height: 1080 }
    ]) {
      expect(videoStageStyle(aspect)).toEqual({});
    }
    expect(DEFAULT_VIDEO_STAGE_ASPECT).toEqual({ width: 16, height: 9 });
  });
});
