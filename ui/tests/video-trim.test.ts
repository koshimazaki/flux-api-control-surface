import { describe, expect, it } from "vitest";
import {
  VIDEO_TRIM_FPS,
  VIDEO_TRIM_FRAME_SECONDS,
  VIDEO_TRIM_MAX_SECONDS,
  VIDEO_TRIM_MIN_FRAMES,
  buildTrimArgs,
  clampTrimSelection,
  defaultTrimSelection,
  formatTimecode,
  framesIn,
  moveTrimSelection,
  needsTrimForEdit,
  snapToFrame,
  trimRulerSeconds,
  trimSelectionBlocker
} from "@/lib/video-trim";

const MIN_LENGTH = VIDEO_TRIM_MIN_FRAMES * VIDEO_TRIM_FRAME_SECONDS;

describe("cut bracket", () => {
  it("knows which clips Video Edit cannot take", () => {
    expect(needsTrimForEdit(20)).toBe(true);
    expect(needsTrimForEdit(15)).toBe(false);
    // FLUX 3's own 15 s renders report container durations slightly over 15.
    expect(needsTrimForEdit(15.4)).toBe(false);
    expect(needsTrimForEdit(15.6)).toBe(true);
    expect(needsTrimForEdit(undefined)).toBe(false);
  });

  it("opens on the first 15 seconds of an over-length clip", () => {
    expect(defaultTrimSelection(20)).toEqual({ start: 0, end: 15 });
    // A clip already short enough is selected whole.
    expect(defaultTrimSelection(8)).toEqual({ start: 0, end: 8 });
  });

  it("snaps both edges to the 24 fps grid the API works on", () => {
    expect(snapToFrame(1.01)).toBeCloseTo(1, 5);
    expect(snapToFrame(1.03)).toBeCloseTo(25 / VIDEO_TRIM_FPS, 5);
    const selection = clampTrimSelection({ start: 1.007, end: 6.006 }, 20);
    expect(framesIn(selection.start)).toBe(24);
    expect(framesIn(selection.end)).toBe(144);
  });

  it("allows a cut shorter than the maximum but never shorter than 17 frames", () => {
    // 15 seconds is the ceiling, not the length.
    const short = clampTrimSelection({ start: 2, end: 5 }, 20);
    expect(short).toEqual({ start: 2, end: 5 });
    expect(trimSelectionBlocker(short, 20)).toBeNull();

    const tooShort = clampTrimSelection({ start: 2, end: 2.1 }, 20);
    expect(tooShort.end - tooShort.start).toBeCloseTo(MIN_LENGTH, 5);
    expect(framesIn(tooShort.end - tooShort.start)).toBe(VIDEO_TRIM_MIN_FRAMES);
  });

  it("never selects more than 15 seconds, wherever the edge is dragged", () => {
    expect(clampTrimSelection({ start: 0, end: 20 }, 20)).toEqual({ start: 0, end: VIDEO_TRIM_MAX_SECONDS });
    // Dragging the start edge left of a fixed end still caps the length.
    const fromEnd = clampTrimSelection({ start: 0, end: 19 }, 20);
    expect(fromEnd.end - fromEnd.start).toBeCloseTo(VIDEO_TRIM_MAX_SECONDS, 5);
    expect(trimSelectionBlocker(fromEnd, 20)).toBeNull();
  });

  it("keeps the bracket inside the clip", () => {
    expect(clampTrimSelection({ start: -4, end: 5 }, 20).start).toBe(0);
    const past = clampTrimSelection({ start: 18, end: 26 }, 20);
    expect(past.end).toBeLessThanOrEqual(20);
    expect(past.start).toBeGreaterThanOrEqual(0);
    // A reversed drag is read as a bracket, not an error.
    expect(clampTrimSelection({ start: 9, end: 4 }, 20)).toEqual({ start: 4, end: 9 });
    expect(clampTrimSelection({ start: 1, end: 5 }, 0)).toEqual({ start: 0, end: 0 });
  });

  it("slides without changing length, and stops at the end of the clip", () => {
    const selection = { start: 2, end: 9 };
    const moved = moveTrimSelection(selection, 5, 20);
    expect(moved.end - moved.start).toBeCloseTo(7, 5);
    expect(moved.start).toBeCloseTo(5, 5);

    const clamped = moveTrimSelection(selection, 40, 20);
    expect(clamped.end).toBeCloseTo(20, 5);
    expect(clamped.end - clamped.start).toBeCloseTo(7, 5);
    expect(moveTrimSelection(selection, -10, 20).start).toBe(0);
  });

  it("reports why a bracket cannot be cut", () => {
    expect(trimSelectionBlocker({ start: 0, end: 5 }, undefined)).toMatch(/load a clip/i);
    expect(trimSelectionBlocker({ start: 0, end: 0.2 }, 20)).toMatch(/17 frames/i);
    expect(trimSelectionBlocker({ start: 0, end: 16 }, 20)).toMatch(/15 seconds/i);
    expect(trimSelectionBlocker({ start: 0, end: 15 }, 20)).toBeNull();
  });

  it("reads a time as seconds plus the frame inside them", () => {
    expect(formatTimecode(0)).toBe("0:00+00");
    expect(formatTimecode(7.5)).toBe("0:07+12");
    expect(formatTimecode(65)).toBe("1:05+00");
    expect(formatTimecode(-1)).toBe("0:00+00");
  });

  it("marks the ruler inside the clip only", () => {
    expect(trimRulerSeconds(5)).toEqual([1, 2, 3, 4]);
    expect(trimRulerSeconds(20, 5)).toEqual([5, 10, 15]);
    expect(trimRulerSeconds(0)).toEqual([]);
  });

  it("seeks before the input and re-encodes, so the cut lands on the chosen frames", () => {
    const args = buildTrimArgs({ inputPath: "/tmp/in.mp4", outputPath: "/tmp/out.mp4", start: 3.5, duration: 12 });
    // -ss must precede -i, and a stream copy would snap the cut to a keyframe.
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args).toEqual(expect.arrayContaining(["-t", "12.000", "-c:v", "libx264", "-c:a", "aac"]));
    expect(args).not.toContain("copy");
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });
});
