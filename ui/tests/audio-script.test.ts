import { describe, expect, it } from "vitest";
import type { AudioBandKey, AudioEventKind, AudioMarker } from "@/lib/audio-analysis";
import {
  buildAudioPrompt,
  defaultMotionPrompt,
  imageOptionsFromSources,
  isDefaultMotionPrompt,
  syncShots,
  type AudioShot
} from "@/lib/audio-script";
import type { AssetRecord } from "@/lib/types";

function marker(overrides: Partial<AudioMarker> = {}): AudioMarker {
  return {
    id: "m1",
    time: 1,
    relativeTime: 1,
    kind: "kick",
    band: "low",
    amplitude: 0.5,
    low: 0.6,
    mid: 0.3,
    high: 0.2,
    confidence: 0.8,
    ...overrides
  };
}

const KINDS: AudioEventKind[] = ["kick", "snare", "hat", "beat"];
const BANDS: AudioBandKey[] = ["low", "mid", "high"];

describe("isDefaultMotionPrompt", () => {
  it("recognizes the default prompt for every kind x band combination", () => {
    for (const kind of KINDS) {
      for (const band of BANDS) {
        const prompt = defaultMotionPrompt({ kind, band }, 0);
        expect(isDefaultMotionPrompt(prompt)).toBe(true);
      }
    }
  });

  // Regression for codex P2 on 72b9889: analyzer-emitted "beat" markers were
  // not recognized as defaults, so band/kind edits would not regenerate them.
  it("recognizes analyzer-produced beat-marker defaults", () => {
    expect(isDefaultMotionPrompt(defaultMotionPrompt({ kind: "beat", band: "low" }, 2))).toBe(true);
    expect(isDefaultMotionPrompt(defaultMotionPrompt({ kind: "beat", band: "mid" }, 5))).toBe(true);
    expect(isDefaultMotionPrompt(defaultMotionPrompt({ kind: "beat", band: "high" }, 9))).toBe(true);
  });

  it("ignores the leading index so any row position matches", () => {
    const atZero = defaultMotionPrompt({ kind: "snare", band: "mid" }, 0);
    const atTen = defaultMotionPrompt({ kind: "snare", band: "mid" }, 10);
    expect(atZero).not.toBe(atTen); // different "01"/"11" prefix
    expect(isDefaultMotionPrompt(atTen)).toBe(true);
  });

  it("treats hand-edited text as non-default", () => {
    expect(isDefaultMotionPrompt("03 my own custom shot direction")).toBe(false);
    expect(isDefaultMotionPrompt("")).toBe(false);
  });
});

describe("syncShots", () => {
  const shot = (overrides: Partial<AudioShot> = {}): AudioShot => ({
    id: "shot-m1",
    markerId: "m1",
    imageSourceId: "",
    imageName: "",
    imageDataUrl: "",
    imagePrompt: "",
    prompt: "",
    ...overrides
  });

  it("regenerates an untouched default when the marker kind/band changes", () => {
    const oldDefault = defaultMotionPrompt({ kind: "kick", band: "low" }, 0);
    const next = syncShots([marker({ kind: "snare", band: "mid" })], [shot({ prompt: oldDefault })]);
    expect(next[0].prompt).toBe(defaultMotionPrompt({ kind: "snare", band: "mid" }, 0));
  });

  it("preserves a hand-edited prompt across re-analysis", () => {
    const next = syncShots([marker({ kind: "snare", band: "mid" })], [shot({ prompt: "keep my words" })]);
    expect(next[0].prompt).toBe("keep my words");
  });

  it("fills an empty prompt with the marker default", () => {
    const next = syncShots([marker({ kind: "hat", band: "high" })], [shot({ prompt: "" })]);
    expect(next[0].prompt).toBe(defaultMotionPrompt({ kind: "hat", band: "high" }, 0));
  });
});

describe("imageOptionsFromSources", () => {
  it("keeps recovered gallery outputs that only have a local image URL", () => {
    const options = imageOptionsFromSources(
      [
        {
          id: "recent-output",
          title: "recent output",
          imageDataUrl: "",
          imageUrl: "/api/outputs/recent-output/image",
          image_url: "/api/outputs/recent-output/image",
          sampleUrl: "/api/outputs/recent-output/image",
          prompt: "recent prompt"
        } as AssetRecord
      ],
      []
    );

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: "asset:recent-output",
      imageDataUrl: "/api/outputs/recent-output/image",
      source: "gallery"
    });
  });
});

describe("buildAudioPrompt", () => {
  it("emits the setup, legend, and timeline sections with an @img token for assigned shots", () => {
    const m = marker();
    const shots: AudioShot[] = [
      {
        id: "shot-m1",
        markerId: "m1",
        imageSourceId: "asset:abc",
        imageName: "nepenthes-02",
        imageDataUrl: "data:image/png;base64,xx",
        imagePrompt: "a glowing pitcher plant",
        prompt: defaultMotionPrompt(m, 0)
      }
    ];
    const out = buildAudioPrompt(null, [m], shots, { targetModel: "Seedance 2.0" });
    expect(out).toContain("[SETUP]");
    expect(out).toContain("[IMAGE REFERENCES / LEGEND]");
    expect(out).toContain("[TIMELINE SECOND BY SECOND / AUDIO GUIDED]");
    expect(out).toContain("@img1");
    expect(out).toContain("nepenthes-02");
  });
});
