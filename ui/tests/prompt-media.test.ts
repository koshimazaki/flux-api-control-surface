import { describe, expect, it } from "vitest";
import {
  canPromoteGeneration,
  inferVideoCategory,
  normalizePromptMediaFields,
  promptMediaType,
  promptVideoCategory,
  videoPromptRecordFromEvaluation,
  withoutPromptMediaFields,
  type PromotableGeneration
} from "@/lib/prompt-media";
import {
  buildPromptLibraryOptions,
  promptMatchesLibrary,
  promptMediaGroupId,
  promptLibraryIdForRecord
} from "@/lib/prompt-library-groups";
import type { PromptRecord } from "@/lib/types";

const LEGACY: PromptRecord = {
  id: "cyber_flower_01",
  domain: "cybernetic_flowers",
  species: "flower",
  prompt: "a cybernetic flower",
  prompt_format: "json"
};

describe("prompt record normalization stays backward compatible", () => {
  it("adds nothing to a record that carries no media metadata", () => {
    expect(normalizePromptMediaFields(LEGACY)).toEqual({});
    expect(withoutPromptMediaFields({ ...LEGACY })).toEqual(LEGACY);
  });

  it("reads a legacy record as an image prompt", () => {
    expect(promptMediaType(LEGACY)).toBe("image");
    expect(promptMediaGroupId(LEGACY)).toBe("image_prompts");
  });

  it("keeps every valid additive field", () => {
    const fields = normalizePromptMediaFields({
      mediaType: "video",
      videoCategory: "sequence",
      tags: ["timed", "timed", " audio "],
      videoStructure: {
        setup: "one continuous take",
        beats: [{ start: 0, text: "image 1 — still" }, { text: "" }, { start: 4, text: "image 2 — moves" }],
        camera: "static",
        sound: "room tone"
      },
      provenance: { generationId: "req_1", rating: 5, settings: { duration: 8 } }
    });

    expect(fields.mediaType).toBe("video");
    expect(fields.videoCategory).toBe("sequence");
    expect(fields.tags).toEqual(["timed", "audio"]);
    expect(fields.videoStructure?.beats).toEqual([
      { start: 0, text: "image 1 — still" },
      { start: 4, text: "image 2 — moves" }
    ]);
    expect(fields.provenance).toEqual({ generationId: "req_1", rating: 5, settings: { duration: 8 } });
  });

  it("drops unknown values instead of persisting them", () => {
    const fields = normalizePromptMediaFields({
      mediaType: "hologram",
      videoCategory: "musical",
      tags: "not-an-array",
      videoStructure: "nope",
      provenance: 12
    });
    expect(fields).toEqual({});
  });

  it("resolves a video record's group from its category", () => {
    const record: PromptRecord = {
      id: "vp_1",
      domain: "video_prompts",
      prompt: "Animate image 1.",
      mediaType: "video",
      videoCategory: "dialogue_sound"
    };
    expect(promptMediaGroupId(record)).toBe("video_dialogue_sound");
    expect(promptLibraryIdForRecord(record)).toBe("video_dialogue_sound");
  });

  it("infers a category when a record has none", () => {
    expect(inferVideoCategory("Animate image 1 in cinematic style.")).toBe("simple");
    expect(inferVideoCategory("0s: image 1 — still\n4s: image 2 — moves")).toBe("sequence");
    expect(inferVideoCategory('The host says: "we are still here"')).toBe("dialogue_sound");
    expect(inferVideoCategory(Array.from({ length: 60 }, () => "word").join(" "))).toBe("detailed");
    expect(promptVideoCategory({ videoCategory: undefined, prompt: "Animate image 1." })).toBe("simple");
  });
});

describe("grouped prompt library views", () => {
  const records: PromptRecord[] = [
    LEGACY,
    { id: "audio_1", domain: "audio_sequences", prompt: "a sequence" },
    { id: "gallery_1", domain: "gallery_prompts", prompt: "a saved image prompt" },
    { id: "v_simple", domain: "video_prompts", prompt: "Animate image 1.", mediaType: "video" },
    {
      id: "v_seq",
      domain: "video_prompts",
      prompt: "0s: image 1 — still",
      mediaType: "video",
      videoCategory: "sequence"
    },
    { id: "shared_1", domain: "custom_prompts", prompt: "usable anywhere", mediaType: "shared" }
  ];

  it("lists the PRD media menu plus the existing domain collections", () => {
    const options = buildPromptLibraryOptions(records);
    const byId = new Map(options.map((option) => [option.id, option]));

    expect(options[0].id).toBe("all");
    expect(options[0].count).toBe(records.length);
    expect(options.filter((option) => option.kind === "media").map((option) => option.label)).toEqual([
      "Image Prompts",
      "Video Prompts",
      "Video — Simple",
      "Video — Detailed",
      "Video — Beat / Sequence",
      "Video — Dialogue & Sound",
      "Shared Prompts"
    ]);
    expect(byId.get("image_prompts")?.count).toBe(2);
    expect(byId.get("video_prompts")?.count).toBe(2);
    expect(byId.get("video_simple")?.count).toBe(1);
    expect(byId.get("video_sequence")?.count).toBe(1);
    expect(byId.get("video_detailed")?.count).toBe(0);
    expect(byId.get("shared_prompts")?.count).toBe(1);

    // Existing domain groups keep working; the video domain is covered by the
    // video media groups, so it is not duplicated as a collection.
    const domains = options.filter((option) => option.kind === "domain").map((option) => option.id);
    expect(domains).toContain("audio_sequences");
    expect(domains).toContain("gallery_prompts");
    expect(domains).toContain("cybernetic_flowers");
    expect(domains).not.toContain("video_prompts");
  });

  it("filters by media group and by domain through one membership test", () => {
    expect(records.filter((record) => promptMatchesLibrary(record, "video_prompts")).map((r) => r.id)).toEqual([
      "v_simple",
      "v_seq"
    ]);
    expect(records.filter((record) => promptMatchesLibrary(record, "video_sequence")).map((r) => r.id)).toEqual([
      "v_seq"
    ]);
    expect(records.filter((record) => promptMatchesLibrary(record, "audio_sequences")).map((r) => r.id)).toEqual([
      "audio_1"
    ]);
    expect(records.filter((record) => promptMatchesLibrary(record, "all"))).toHaveLength(records.length);
  });
});

describe("promote a kept generation into the Video library", () => {
  const generation: PromotableGeneration = {
    id: "eval_abc123",
    title: "Corridor drift",
    createdAt: "2026-08-05T10:00:00.000Z",
    mediaType: "video",
    model: "flux-3-video",
    endpoint: "flux-3-video",
    operation: "i2v",
    prompt: { text: "0s: image 1 — still\n5s: image 2 — moves", sourceIds: ["vp_1"] },
    settings: { duration: 8, resolution: "hd" },
    providerRequest: { id: "req_999" },
    sources: { assetIds: ["asset_1", "asset_2"] },
    output: { localPath: "outputs/video.mp4" },
    annotation: { rating: 5, verdict: "keep", tags: ["motion"] }
  };

  it("only offers records rated keep with prompt text", () => {
    expect(canPromoteGeneration(generation)).toBe(true);
    expect(canPromoteGeneration({ ...generation, annotation: { verdict: "maybe" } })).toBe(false);
    expect(canPromoteGeneration({ ...generation, prompt: { text: "  " } })).toBe(false);
  });

  it("carries generation id, settings, and rating onto the saved record", () => {
    const record = videoPromptRecordFromEvaluation(generation);

    expect(record.domain).toBe("video_prompts");
    expect(record.mediaType).toBe("video");
    expect(record.videoCategory).toBe("sequence");
    expect(record.prompt).toBe(generation.prompt.text);
    expect(record.tags).toEqual(["motion", "promoted"]);
    expect(record.provenance).toMatchObject({
      generationId: "req_999",
      evaluationId: "eval_abc123",
      model: "flux-3-video",
      rating: 5,
      verdict: "keep",
      settings: { duration: 8, resolution: "hd" },
      outputPath: "outputs/video.mp4",
      sourceAssetIds: ["asset_1", "asset_2"]
    });
    // The promoted record survives a normalization round trip unchanged.
    expect(normalizePromptMediaFields(record)).toEqual({
      mediaType: record.mediaType,
      videoCategory: record.videoCategory,
      tags: record.tags,
      provenance: record.provenance
    });
  });
});
