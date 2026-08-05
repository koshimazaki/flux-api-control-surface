import { describe, expect, it } from "vitest";
import {
  compilePromptText,
  extractPlaceholders,
  isPromptCompiled,
  placeholderLabel,
  promptPlaceholderIssue
} from "@/lib/prompt-placeholders";
import {
  applyStylePreset,
  compileVideoPromptTemplate,
  findVideoPromptTemplate,
  videoPromptTemplates,
  videoTemplatePlaceholders,
  POSITIONAL_IMAGE_CONVENTION,
  VIDEO_PROMPT_CATEGORIES,
  VIDEO_PROMPT_TEMPLATES,
  VIDEO_STYLE_PRESETS
} from "@/lib/video-prompt-templates";
import { planVideoScript } from "@/lib/video-script-plan";
import { buildVideoScriptQueueJobs } from "@/lib/video-script/enqueue";

describe("placeholder engine", () => {
  it("finds unique blanks in order and labels them", () => {
    expect(extractPlaceholders("{subject} meets {style}; {subject} again")).toEqual(["subject", "style"]);
    expect(placeholderLabel("camera_move")).toBe("Camera move");
  });

  it("never mistakes JSON or prose braces for blanks", () => {
    expect(extractPlaceholders('{"species": "flower", "seed": 4}')).toEqual([]);
    expect(extractPlaceholders("a brace { } and {1invalid}")).toEqual([]);
  });

  it("leaves an unfilled blank in place so the guard can see it", () => {
    const compiled = compilePromptText("Animate image 1 in {style}. {subject} moves.", { style: "anime style" });
    expect(compiled).toBe("Animate image 1 in anime style. {subject} moves.");
    expect(isPromptCompiled(compiled)).toBe(false);
    expect(promptPlaceholderIssue(compiled)).toContain("{subject}");
    expect(promptPlaceholderIssue("Animate image 1 in anime style.")).toBeNull();
  });
});

describe("starter template packs", () => {
  it("covers every video category with public-safe starter templates", () => {
    for (const category of VIDEO_PROMPT_CATEGORIES) {
      expect(videoPromptTemplates(category.id).length, `${category.id} needs templates`).toBeGreaterThan(0);
    }
    expect(videoPromptTemplates()).toHaveLength(VIDEO_PROMPT_TEMPLATES.length);
    // Ids are unique, so a saved provenance templateId always resolves.
    expect(new Set(VIDEO_PROMPT_TEMPLATES.map((template) => template.id)).size).toBe(VIDEO_PROMPT_TEMPLATES.length);
  });

  it("ships templates as blanks to fill, not finished prompts", () => {
    for (const template of VIDEO_PROMPT_TEMPLATES) {
      expect(videoTemplatePlaceholders(template).length, `${template.id} should carry blanks`).toBeGreaterThan(0);
    }
  });

  it("addresses keyframes positionally so permuted images keep prompts valid", () => {
    const positional = VIDEO_PROMPT_TEMPLATES.filter((template) => /image \d/.test(template.body));
    expect(positional.length).toBeGreaterThanOrEqual(VIDEO_PROMPT_TEMPLATES.length - 3);
    expect(POSITIONAL_IMAGE_CONVENTION).toMatch(/image 1/);
  });

  it("gives the simple pack a {style} blank for the quick buttons", () => {
    const simple = videoPromptTemplates("simple");
    expect(simple.every((template) => videoTemplatePlaceholders(template).includes("style"))).toBe(true);
    expect(VIDEO_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "studio",
      "cinematic",
      "film",
      "anime",
      "documentary",
      "stop-motion"
    ]);
  });

  it("uses {t1}-style timed beats in the sequence pack", () => {
    for (const template of videoPromptTemplates("sequence")) {
      expect(template.body, `${template.id} needs timed beats`).toMatch(/\{t1\}s/);
      expect(template.structure?.beats?.length).toBeGreaterThan(1);
    }
  });
});

describe("template compilation", () => {
  const template = findVideoPromptTemplate("video_sequence_two_frame");

  it("fills blanks and parses timed beats into structured sections", () => {
    const compiled = compileVideoPromptTemplate(template!, {
      summary: "a curtain crossing a window",
      style: "35mm film style",
      t1: "0",
      t2: "5",
      beat1: "the curtain is closed",
      beat2: "the curtain is fully drawn back"
    });

    expect(compiled.pending).toEqual([]);
    expect(compiled.text).toContain("0s: image 1 — the curtain is closed");
    expect(compiled.text).not.toContain("{");
    expect(compiled.structure?.beats).toEqual([
      { start: 0, text: "image 1 — the curtain is closed" },
      { start: 5, text: "image 2 — the curtain is fully drawn back" }
    ]);
    expect(compiled.category).toBe("sequence");
    expect(compiled.templateId).toBe("video_sequence_two_frame");
  });

  it("reports the blanks that are still missing", () => {
    const compiled = compileVideoPromptTemplate(template!, { summary: "a curtain", t1: "0" });
    expect(compiled.pending).toContain("style");
    expect(compiled.pending).toContain("beat1");
    expect(compiled.text).toContain("{style}");
  });

  it("style quick-buttons fill {style} or append the phrase once", () => {
    const filled = applyStylePreset("Animate image 1 in {style}.", "anime style");
    expect(filled).toBe("Animate image 1 in anime style.");
    expect(applyStylePreset("Animate image 1.", "anime style")).toBe("Animate image 1. anime style.");
    expect(applyStylePreset("Animate image 1", "anime style")).toBe("Animate image 1, anime style.");
    // Applying the same preset twice does not stack it.
    expect(applyStylePreset(filled, "anime style")).toBe(filled);
    expect(applyStylePreset("", "anime style")).toBe("anime style.");
  });
});

describe("uncompiled placeholders never reach generation", () => {
  const base = {
    manualRows: [{ id: "row_1", assetIds: ["a1", "a2"] }],
    settings: { duration: 8 as const, safetyTolerance: 2 }
  };

  it("blocks the row at the planner boundary", () => {
    const plan = planVideoScript({
      ...base,
      prompts: [{ id: "vp_template", text: "Animate image 1 in {style}." }]
    });

    expect(plan.rows[0].errors.map((error) => error.code)).toContain("prompt_placeholders");
    expect(plan.preview.validRowCount).toBe(0);
    expect(buildVideoScriptQueueJobs(plan, { batchId: "b1" })).toEqual([]);
  });

  it("lets the same row through once the blank is filled", () => {
    const plan = planVideoScript({
      ...base,
      prompts: [{ id: "vp_template", text: "Animate image 1 in anime style." }]
    });

    expect(plan.rows[0].errors).toEqual([]);
    expect(plan.preview.validRowCount).toBe(1);
    expect(buildVideoScriptQueueJobs(plan, { batchId: "b1" })).toHaveLength(1);
  });

  it("refuses the batch outright if an unfilled row ever reached the enqueue boundary", () => {
    const plan = planVideoScript({
      ...base,
      prompts: [{ id: "vp_template", text: "Animate image 1 in {style}." }]
    });
    const forced = { ...plan, rows: plan.rows.map((row) => ({ ...row, errors: [] })) };

    expect(() => buildVideoScriptQueueJobs(forced, { batchId: "b1" })).toThrow(/unfilled prompt blank/i);
  });
});
