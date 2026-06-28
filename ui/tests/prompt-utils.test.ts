import { describe, expect, it } from "vitest";
import {
  applyPresetToPrompt,
  composeReferencePrompt,
  defaultReferenceCue,
  fallbackReferenceCue,
  presets,
  stripReferenceCue
} from "@/lib/prompt-utils";
import { missingPromptImageTokens, missingPromptReferenceRoleTokens } from "@/lib/dashboard-generation";
import type { ReferenceImage } from "@/lib/types";

describe("applyPresetToPrompt", () => {
  it("updates combo source prompts so stale look text does not remain at the end", () => {
    const moon = presets.find((preset) => preset.id === "moon")!;
    const magic = presets.find((preset) => preset.id === "magic")!;
    const raw = JSON.stringify(
      {
        style: moon.style,
        lighting: moon.lighting,
        combo_sources: [
          {
            id: "source_1",
            prompt: {
              style: moon.style,
              lighting: moon.lighting,
              camera: { lens: moon.lens }
            }
          }
        ]
      },
      null,
      2
    );

    const parsed = JSON.parse(applyPresetToPrompt(raw, magic));

    expect(parsed.style).toBe(magic.style);
    expect(parsed.lighting).toBe(magic.lighting);
    expect(parsed.combo_sources[0].prompt.style).toBe(magic.style);
    expect(parsed.combo_sources[0].prompt.lighting).toBe(magic.lighting);
    expect(JSON.stringify(parsed)).not.toContain(moon.lighting);
  });
});

describe("composeReferencePrompt", () => {
  it("adds the fallback reference cue for blank custom cue text", () => {
    const prompt = composeReferencePrompt("a flower", "   ", true);

    expect(prompt).toContain("a flower");
    expect(prompt).toContain(`Reference roles: ${fallbackReferenceCue}`);
  });

  it("lets generate validation ignore the shared reference cue prose", () => {
    const references: ReferenceImage[] = [
      { id: "one", name: "one", value: "data:image/png;base64,one", role: "character" }
    ];
    const prompt = composeReferencePrompt("portrait using @img1", defaultReferenceCue, true);
    const authoredPrompt = stripReferenceCue(prompt);

    expect(prompt).toContain("@img2");
    expect(missingPromptImageTokens(authoredPrompt, references)).toEqual([]);
    expect(missingPromptReferenceRoleTokens(authoredPrompt, references)).toEqual([]);
  });
});
