import { describe, expect, it } from "vitest";
import { cameraSections, cameraTerms, emptyCameraSelection, type CameraSelection } from "@/lib/camera-language";
import { combinationNotes, previewSupport, selectionCoverage } from "@/lib/preview-support";

describe("preview support registry", () => {
  it("records every term with a level and a note, and nothing else", () => {
    expect(Object.keys(previewSupport).sort()).toEqual(cameraTerms.map((term) => term.id).sort());
    for (const term of cameraTerms) {
      const support = previewSupport[term.id];
      expect(["shot", "diagram", "approximation", "prompt-only"]).toContain(support.level);
      expect(support.note.length).toBeGreaterThan(10);
    }
  });

  it("covers all fourteen sections, with honest stand-ins where the sketch cannot show the term", () => {
    expect(cameraSections).toHaveLength(14);
    expect(previewSupport["large-format"].level).toBe("prompt-only");
    expect(previewSupport.vhs.level).toBe("approximation");
    expect(previewSupport["shallow-focus"].level).toBe("shot");
  });

  it("groups a selection by how far the preview shows it, in guide order", () => {
    const selection = { ...emptyCameraSelection, "shot-sizes": "close-up", format: "large-format", vfx: "hologram", focus: "rack-focus" } as CameraSelection;
    const coverage = selectionCoverage(selection);
    expect(coverage.shown.map(({ term }) => term.id)).toEqual(["close-up", "rack-focus"]);
    expect(coverage.approximate.map(({ term }) => term.id)).toEqual(["hologram"]);
    expect(coverage.promptOnly.map(({ term }) => term.id)).toEqual(["large-format"]);
  });

  it("explains choices the preview cannot draw together, and stays quiet otherwise", () => {
    const pick = (choice: Partial<CameraSelection>) => ({ ...emptyCameraSelection, ...choice }) as CameraSelection;
    expect(combinationNotes(pick({ format: "vhs", "art-direction": "teal-orange", animation: "anime" }))).toEqual([]);
    expect(combinationNotes(pick({ pov: "handheld", "shot-sizes": "close-up", transitions: "dissolve" }))).toEqual([]);
    const drone = combinationNotes(pick({ pov: "drone", "shot-sizes": "close-up", lenses: "lens-85mm", transitions: "hard-cut" }));
    expect(drone).toHaveLength(3);
    expect(drone[0]).toMatch(/^Drone flyover places the camera/);
    const shown = selectionCoverage(pick({ pov: "drone", "shot-sizes": "close-up", lenses: "lens-85mm", transitions: "hard-cut" })).shown;
    expect(shown.map(({ term }) => term.id)).toEqual(["lens-85mm", "drone"]);
    expect(combinationNotes(pick({ format: "split-screen", transitions: "dissolve", vfx: "double-exposure" }))).toHaveLength(2);
    expect(combinationNotes(pick({ transitions: "morph-cut", vfx: "liquid-morph" }))).toEqual([
      "Morph and liquid form both reshape the subject; the morph is drawn."
    ]);
  });
});
