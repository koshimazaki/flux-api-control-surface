import { describe, expect, it } from "vitest";
import { promptLibraryComboPreset, promptLibraryLabel } from "@/lib/prompt-library-groups";
import { normalizeComboSettings } from "@/lib/prompt-combo";

describe("prompt library groups", () => {
  it("labels the alien creature library", () => {
    expect(promptLibraryLabel("alien_creatures")).toBe("Alien Creatures");
  });

  it("provides alien creature combo settings for agent-created libraries", () => {
    const settings = normalizeComboSettings(promptLibraryComboPreset("alien_creatures"));

    expect(settings.definition).toBe("A single invented alien creature species");
    expect(settings.primaryLabel).toBe("primary creature anatomy");
    expect(settings.secondaryLabel).toBe("secondary creature anatomy");
    expect(settings.linkPhrase).toBe("xenobiologically hybridized with");
    expect(settings.environment).toBe("deep_ocean");
    expect(settings.environmentOptions.map((option) => option.name)).toEqual([
      "Jungle",
      "Deep Ocean",
      "Antarctica",
      "Desert",
      "Lab"
    ]);
    expect(settings.environmentOptions.find((option) => option.id === "desert")?.description).toContain("sandworm");
  });
});
