import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrimProgress,
  percentFromProgressChunk,
  readTrimProgress,
  setTrimProgress
} from "@/lib/video-trim-progress";

describe("cut progress", () => {
  beforeEach(() => {
    clearTrimProgress("cut-1");
  });

  it("reads ffmpeg's out_time as microseconds, whichever field carries it", () => {
    // Both out_time_us and out_time_ms emit microseconds — the long-standing
    // ffmpeg quirk this parser exists to absorb.
    expect(percentFromProgressChunk("out_time_us=3000000\nprogress=continue\n", 6)).toBeCloseTo(50, 5);
    expect(percentFromProgressChunk("out_time_ms=3000000\nprogress=continue\n", 6)).toBeCloseTo(50, 5);
  });

  it("uses the newest sample in a chunk that carries several", () => {
    const chunk = "out_time_us=1000000\nprogress=continue\nout_time_us=4500000\nprogress=continue\n";
    expect(percentFromProgressChunk(chunk, 6)).toBeCloseTo(75, 5);
  });

  it("never reports beyond the bracket, and ignores unusable input", () => {
    expect(percentFromProgressChunk("out_time_us=99000000\n", 6)).toBe(100);
    expect(percentFromProgressChunk("frame=12\nfps=24\n", 6)).toBeNull();
    expect(percentFromProgressChunk("out_time_us=1000000\n", 0)).toBeNull();
    expect(percentFromProgressChunk("out_time_us=1000000\n", Number.NaN)).toBeNull();
  });

  it("stores, clamps, and clears a run's progress", () => {
    setTrimProgress("cut-1", { percent: 42 });
    expect(readTrimProgress("cut-1")).toMatchObject({ percent: 42 });

    setTrimProgress("cut-1", { percent: 140 });
    expect(readTrimProgress("cut-1")?.percent).toBe(100);
    setTrimProgress("cut-1", { percent: -5 });
    expect(readTrimProgress("cut-1")?.percent).toBe(0);

    setTrimProgress("cut-1", { percent: 100, done: true });
    expect(readTrimProgress("cut-1")).toMatchObject({ done: true });

    clearTrimProgress("cut-1");
    expect(readTrimProgress("cut-1")).toBeNull();
    expect(readTrimProgress("never-started")).toBeNull();
  });
});
