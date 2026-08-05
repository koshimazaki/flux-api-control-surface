import { describe, expect, it, vi } from "vitest";
import type { AudioMarker } from "@/lib/audio-analysis";
import {
  audioMarkerTimingTemplate,
  type AudioMarkerSource
} from "@/lib/video-script/audio-markers";

function marker(id: string, time: number, overrides: Partial<AudioMarker> = {}): AudioMarker {
  return {
    id,
    time,
    relativeTime: time,
    kind: "beat",
    band: "low",
    amplitude: 0.5,
    low: 0.6,
    mid: 0.3,
    high: 0.2,
    confidence: 0.8,
    ...overrides
  };
}

function source(overrides: Partial<AudioMarkerSource> = {}): AudioMarkerSource {
  return {
    markers: [marker("m1", 0), marker("m2", 2), marker("m3", 4), marker("m4", 6), marker("m5", 12)],
    transitionMarkerIds: ["m1", "m3", "m5"],
    lockedMarkerIds: ["m2", "m4"],
    sliceStartSeconds: 0,
    ...overrides
  };
}

describe("audio marker import", () => {
  it("samples beat markers evenly across the requested keyframe count", () => {
    const result = audioMarkerTimingTemplate(source(), { kind: "beat", keyframeCount: 3, duration: 8 });
    // m5 at 12s is outside the 8s duration, so the run is 0/2/4/6.
    expect(result.seconds).toEqual([0, 4, 6]);
    expect(result.matched).toBe(5);
  });

  it("keeps every marker when there are fewer than keyframe positions", () => {
    const result = audioMarkerTimingTemplate(source(), { kind: "locked", keyframeCount: 4, duration: 8 });
    expect(result.seconds).toEqual([2, 6]);
    expect(result.note).toMatch(/locked/);
  });

  it("reads shot boundaries as transition markers", () => {
    const result = audioMarkerTimingTemplate(source(), { kind: "transition", keyframeCount: 4, duration: 20 });
    expect(result.seconds).toEqual([0, 4, 12]);
  });

  it("rebases times onto the analysed slice", () => {
    const result = audioMarkerTimingTemplate(source({ sliceStartSeconds: 2 }), {
      kind: "beat",
      keyframeCount: 4,
      duration: 8
    });
    // Markers at 0/2/4/6/12 with a 2s slice start become 0/0/2/4/10; 10 is past
    // the duration and the repeated 0 collapses, because strictly increasing is
    // a planner rule.
    expect(result.seconds).toEqual([0, 2, 4]);
  });

  it("reports honestly when nothing can be imported", () => {
    const empty = audioMarkerTimingTemplate(source({ lockedMarkerIds: [] }), {
      kind: "locked",
      keyframeCount: 4,
      duration: 8
    });
    expect(empty.seconds).toEqual([]);
    expect(empty.note).toMatch(/no locked markers/i);

    const outside = audioMarkerTimingTemplate(source({ markers: [marker("m9", 30)] }), {
      kind: "beat",
      keyframeCount: 4,
      duration: 8
    });
    expect(outside.seconds).toEqual([]);
    expect(outside.note).toMatch(/outside the 8s duration/i);
  });

  it("produces a template the planner accepts", async () => {
    const { planVideoScript } = await import("@/lib/video-script-plan");
    const template = audioMarkerTimingTemplate(source(), { kind: "beat", keyframeCount: 3, duration: 8 }).seconds;
    const plan = planVideoScript({
      manualRows: [{ id: "row", assetIds: ["a", "b", "c"] }],
      prompts: [{ id: "p", text: "go" }],
      timingMode: "timed",
      timingTemplate: template,
      settings: { duration: 8 }
    });

    expect(plan.rows[0].errors).toEqual([]);
    expect(plan.rows[0].timedKeyframes).toEqual([
      [0, "a"],
      [4, "b"],
      [6, "c"]
    ]);
  });
});

describe("audio marker source reader", () => {
  it("returns null when the Audio Script has no cached markers in this browser", async () => {
    vi.resetModules();
    vi.doMock("@/lib/audio-session-storage", () => ({
      loadCachedAudioScriptState: () => null
    }));
    const { readAudioScriptMarkerSource } = await import("@/lib/video-script/audio-markers");
    expect(readAudioScriptMarkerSource()).toBeNull();
    vi.doUnmock("@/lib/audio-session-storage");
    vi.resetModules();
  });

  it("maps the cached shots and locks onto the import source", async () => {
    vi.resetModules();
    vi.doMock("@/lib/audio-session-storage", () => ({
      loadCachedAudioScriptState: () => ({
        markers: [marker("m1", 1), marker("m2", 3)],
        shots: [{ id: "s1", markerId: "m2", imageSourceId: "", imageName: "", imageDataUrl: "", imagePrompt: "", prompt: "" }],
        lockedMarkerIds: ["m1"],
        sliceStartSeconds: 0.5
      })
    }));
    const { readAudioScriptMarkerSource } = await import("@/lib/video-script/audio-markers");
    const loaded = readAudioScriptMarkerSource();

    expect(loaded?.markers).toHaveLength(2);
    expect(loaded?.transitionMarkerIds).toEqual(["m2"]);
    expect(loaded?.lockedMarkerIds).toEqual(["m1"]);
    expect(loaded?.sliceStartSeconds).toBe(0.5);
    vi.doUnmock("@/lib/audio-session-storage");
    vi.resetModules();
  });
});
