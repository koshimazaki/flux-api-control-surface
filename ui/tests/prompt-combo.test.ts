import { describe, expect, it } from "vitest";
import {
  buildComboPrompt,
  defaultComboSettings,
  normalizeComboSettings,
  promptHeaderSummary,
  type ComboSettings
} from "@/lib/prompt-combo";
import type { PromptRecord } from "@/lib/types";

const sourcePrompts: PromptRecord[] = [
  {
    id: "orchid_01",
    species: "acid fuchsia orchid",
    plant_form: "translucent orchid membranes",
    seed: 1001,
    prompt: JSON.stringify({
      subjects: [{ description: "acid fuchsia orchid with translucent petal membranes and bright vascular veins" }],
      environment: "misty rainforest floor",
      lighting: "magic hour backlight",
      style: "cinematic botanical macro photography",
      materials: "wet petal membrane and ceramic vein detail"
    })
  },
  {
    id: "bat_flower_01",
    species: "black bat flower",
    plant_form: "gothic whisker tendrils",
    seed: 1002,
    prompt: JSON.stringify({
      subjects: [{ description: "black bat flower with long whisker tendrils and gothic wing-like petals" }],
      environment: "dark botanical laboratory",
      lighting: "blue moonlight",
      style: "nocturnal macro realism",
      materials: "velvet dark petals and metallic tendrils"
    })
  }
];

const comboSettings: ComboSettings = normalizeComboSettings({
  ...defaultComboSettings,
  definition: "A new plant species",
  primaryLabel: "flower A",
  secondaryLabel: "flower B",
  linkPhrase: "is botanically grafted into",
  environment: "jungle"
});

describe("buildComboPrompt", () => {
  it("defaults to a compact morph prompt with A/B joining language", () => {
    const prompt = buildComboPrompt(sourcePrompts, { settings: comboSettings });

    expect(prompt).toContain("A new plant species.");
    expect(prompt).toContain("A (flower A)");
    expect(prompt).toContain("B (flower B)");
    expect(prompt).toContain("is botanically grafted into");
    expect(prompt).toContain("Environment: humid tropical jungle glasshouse");
    expect(prompt).not.toContain("combo_sources");
  });

  it("keeps hybrid JSON compact by omitting full source prompt archives", () => {
    const parsed = JSON.parse(buildComboPrompt(sourcePrompts, { mode: "hybrid", settings: comboSettings }));

    expect(parsed.combo.mode).toBe("morphed source fusion");
    expect(parsed.subjects[0].source_influences).toHaveLength(2);
    expect(parsed.combo_sources).toBeUndefined();
  });

  it("keeps hybrid JSON wording neutral enough for non-plant libraries", () => {
    const parsed = JSON.parse(buildComboPrompt(sourcePrompts, { mode: "hybrid", settings: comboSettings }));

    expect(parsed.scene).not.toContain("botanical");
    expect(parsed.combo.directive).not.toContain("source plants");
    expect(parsed.subjects[0].fused_anatomy).not.toContain("petal");
  });

  it("keeps the legacy stack mode available with full combo sources", () => {
    const parsed = JSON.parse(buildComboPrompt(sourcePrompts, { mode: "stack", settings: comboSettings }));

    expect(parsed.combo.mode).toBe("stacked-source fusion");
    expect(parsed.combo_sources).toHaveLength(2);
    expect(parsed.combo_sources[0].prompt.subjects[0].description).toContain("acid fuchsia orchid");
  });

  it("keeps custom descriptions for default environment ids", () => {
    const settings = normalizeComboSettings({
      environment: "jungle",
      environmentOptions: [
        {
          id: "jungle",
          name: "Jungle",
          description: "humid alien jungle canopy with fungal mist"
        }
      ]
    });

    expect(settings.environmentOptions.find((option) => option.id === "jungle")?.description).toBe(
      "humid alien jungle canopy with fungal mist"
    );
  });

  it("does not duplicate a leading is in morph link phrases", () => {
    const prompt = buildComboPrompt(sourcePrompts, {
      settings: normalizeComboSettings({ ...comboSettings, linkPhrase: "is xenobiologically hybridized with" })
    });

    expect(prompt).toContain("A is xenobiologically hybridized with B");
    expect(prompt).not.toContain("A is is xenobiologically");
  });
});

describe("promptHeaderSummary", () => {
  it("summarizes a combo by mode and source count", () => {
    expect(
      promptHeaderSummary({
        combo: { mode: "hybrid", sources: ["a_01", "b_01", "c_01"] }
      })
    ).toBe("Hybrid · 3 sources");
  });

  it("appends applied look and environment without growing the base", () => {
    expect(
      promptHeaderSummary({
        combo: { mode: "morph", sources: ["a_01", "b_01"] },
        lightingLabel: "Moonlit",
        environmentLabel: "Lab"
      })
    ).toBe("Morph · 2 sources + Moonlit + Lab");
  });

  it("uses a single-source label and falls back to the prompt id for non-combos", () => {
    expect(promptHeaderSummary({ combo: { mode: "stack", sources: ["solo_01"] } })).toBe("Stack JSON · 1 source");
    expect(promptHeaderSummary({ fallbackId: "orchid_01", lightingLabel: "Cinematic" })).toBe(
      "orchid_01 + Cinematic"
    );
    expect(promptHeaderSummary({})).toBe("Generate");
  });
});
