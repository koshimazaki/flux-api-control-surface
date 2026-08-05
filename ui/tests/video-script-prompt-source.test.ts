import { describe, expect, it } from "vitest";
import type { PromptRecord } from "@/lib/types";
import { planVideoScript } from "@/lib/video-script-plan";
import {
  COMPOSER_PROMPT_ID,
  groupVideoScriptPrompts,
  starterTemplateBody,
  videoLibraryPromptCount,
  videoScriptPromptSource
} from "@/lib/video-script/prompt-source";
import { videoScriptPromptBlockers, videoScriptPrompts } from "@/lib/video-script/plan-input";

const RECORDS: PromptRecord[] = [
  { id: "img_legacy", domain: "cybernetic_flowers", prompt: "a cybernetic flower" },
  { id: "vid_simple", domain: "video_prompts", prompt: "Animate image 1 in anime style.", mediaType: "video" },
  {
    id: "vid_seq",
    domain: "video_prompts",
    prompt: "0s: image 1 — still",
    mediaType: "video",
    videoCategory: "sequence"
  },
  { id: "shared_any", domain: "custom_prompts", prompt: "usable in both workflows", mediaType: "shared" },
  { id: "audio_seq", domain: "audio_sequences", prompt: "an audio sequence" }
];

describe("video script prompt source", () => {
  it("uses the composer field as one prompt over every row", () => {
    const source = videoScriptPromptSource({
      records: RECORDS,
      promptIds: ["vid_simple", "vid_seq"],
      composerText: "  Animate image 1 in cinematic style.  ",
      mode: "cartesian"
    });

    expect(source.source).toBe("composer");
    expect(source.prompts).toEqual([{ id: COMPOSER_PROMPT_ID, text: "Animate image 1 in cinematic style." }]);
    // Cartesian never multiplies rows behind the user's back while the field drives the batch.
    expect(source.mode).toBe("single");
    expect(source.blockers).toEqual([]);
  });

  it("falls back to the library selection and its assignment mode when the field is empty", () => {
    const source = videoScriptPromptSource({
      records: RECORDS,
      promptIds: ["vid_seq", "vid_simple"],
      composerText: "   ",
      mode: "rotate"
    });

    expect(source.source).toBe("library");
    expect(source.mode).toBe("rotate");
    expect(source.prompts.map((prompt) => prompt.id)).toEqual(["vid_seq", "vid_simple"]);
  });

  it("reports no source when nothing is selected or typed", () => {
    const source = videoScriptPromptSource({ records: RECORDS, promptIds: [], composerText: "", mode: "single" });
    expect(source.source).toBe("none");
    expect(source.prompts).toEqual([]);
  });

  it("blocks an unfilled template blank from either source", () => {
    const composer = videoScriptPromptSource({
      records: RECORDS,
      promptIds: [],
      composerText: "Animate image 1 in {style}.",
      mode: "single"
    });
    expect(composer.blockers).toHaveLength(1);
    expect(composer.blockers[0]).toContain("{style}");

    const library = videoScriptPromptSource({
      records: [...RECORDS, { id: "vid_draft", prompt: "Open on image 1: {first_frame}.", mediaType: "video" }],
      promptIds: ["vid_draft"],
      composerText: "",
      mode: "single"
    });
    expect(library.blockers[0]).toContain("vid_draft");
    expect(videoScriptPromptBlockers(videoScriptPrompts(RECORDS, ["vid_simple"]))).toEqual([]);
  });

  it("plans one prompt across every row when the composer drives the batch", () => {
    const source = videoScriptPromptSource({
      records: RECORDS,
      promptIds: [],
      composerText: "Animate image 1 in cinematic style.",
      mode: "single"
    });
    const plan = planVideoScript({
      manualRows: [
        { id: "row_1", assetIds: ["a1", "a2"] },
        { id: "row_2", assetIds: ["a2", "a1"] }
      ],
      prompts: source.prompts,
      promptMode: source.mode,
      settings: { duration: 8, safetyTolerance: 2 }
    });

    expect(plan.preview.promptExpandedRowCount).toBe(2);
    expect(plan.rows.every((row) => row.compiledPrompt === "Animate image 1 in cinematic style.")).toBe(true);
    expect(plan.preview.validRowCount).toBe(2);
  });
});

describe("video script library browser grouping", () => {
  it("puts video and shared groups first and keeps image prompts in their own group", () => {
    const groups = groupVideoScriptPrompts(RECORDS);
    expect(groups.map((group) => group.id)).toEqual([
      "video_simple",
      "video_sequence",
      "shared_prompts",
      "image_prompts",
      "audio_prompts"
    ]);
    expect(groups[0].label).toBe("Video — Simple");
    expect(groups.find((group) => group.id === "image_prompts")?.prompts.map((record) => record.id)).toEqual([
      "img_legacy"
    ]);
    expect(videoLibraryPromptCount(RECORDS)).toBe(3);
  });

  it("omits empty groups", () => {
    expect(groupVideoScriptPrompts([]).length).toBe(0);
    expect(groupVideoScriptPrompts([RECORDS[0]]).map((group) => group.id)).toEqual(["image_prompts"]);
  });
});

describe("prompt type selector loads starter templates", () => {
  it("loads that category's template body into the composer field", () => {
    expect(starterTemplateBody("simple")).toContain("image 1");
    expect(starterTemplateBody("sequence")).toMatch(/\{t1\}s/);
    expect(starterTemplateBody("dialogue_sound")).toMatch(/\{line\}|\{line_a\}/);
    expect(starterTemplateBody("detailed", "video_detailed_transition")).toContain("Open on image 1");
    // An unknown id falls back to the category's first template rather than emptying the field.
    expect(starterTemplateBody("simple", "not_a_template")).toBe(starterTemplateBody("simple"));
  });
});
