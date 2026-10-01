import { describe, expect, it } from "vitest";
import { normalizeFlux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import { normalizeToolWorkspaceCache } from "@/lib/dashboard/workspace-cache";
import { imageWorkspaceModes, workspaceModesForMedia } from "@/lib/workspace-media";

const legacyBox = { id: "box-a", x: 10, y: 20, width: 100, height: 80, fuzz: 8, prompt: "make the scarf red" };

describe("FLUX 3 Image workspace state", () => {
  it("reads a stored draft defensively, turning mask-era regions into boxes", () => {
    const draft = normalizeFlux3ImageDraft({
      mode: "precise",
      editTool: "eraser",
      regionTool: "lasso",
      prompts: { t2i: "fox", edit: 4 },
      regions: [
        { id: "r1", kind: "lasso", x: 5, y: 5, width: 50, height: 40, paths: [[[0, 0], [1, 0], [1, 1]]], fuzz: 999, prompt: "sky", referenceId: "asset-9" },
        { id: "r2", kind: "paint", x: 0, y: 0, width: 10, height: 10, paths: [], fuzz: 4, prompt: "" },
        { id: "bad", x: -1, y: 0, width: 5, height: 5 },
        "junk"
      ],
      regionSourceId: "asset-1"
    });
    expect(draft).toMatchObject({ mode: "precise", regionSourceId: "asset-1", regionFrame: null, layoutEnabled: false, layoutRegions: [] });
    // The painting tools are gone with the masks.
    expect(draft).not.toHaveProperty("editTool");
    expect(draft).not.toHaveProperty("regionTool");
    expect(draft.prompts).toEqual({ t2i: "fox", i2i: "", edit: "", precise: "" });
    expect(draft.references).toEqual(Array.from({ length: 10 }, () => null));
    expect(draft.settings).toEqual({ aspectRatio: "auto", resolution: "1k", grounding: true, safetyTolerance: 2 });
    // Lasso and brush regions keep their bounds as change boxes; outlines and fuzz are dropped.
    expect(draft.regions).toEqual([
      { id: "r1", x: 5, y: 5, width: 50, height: 40, action: "change", prompt: "sky", referenceId: "asset-9" },
      { id: "r2", x: 0, y: 0, width: 10, height: 10, action: "change", prompt: "", referenceId: null }
    ]);
    expect(normalizeFlux3ImageDraft("nope").mode).toBe("t2i");
    expect(normalizeFlux3ImageDraft({ mode: "i2i", references: ["asset-1", 7, "", "asset-4", "extra"] })).toMatchObject({
      mode: "i2i",
      references: ["asset-1", null, null, "asset-4", "extra", null, null, null, null, null]
    });
    expect(normalizeFlux3ImageDraft({ settings: { resolution: "4k", grounding: false } }).settings).toMatchObject({
      resolution: "4k",
      grounding: false
    });
    expect(
      normalizeFlux3ImageDraft({ regionFrame: { width: 1360, height: 768 }, layoutEnabled: true, layoutRegions: [{ id: "l1", x: 0, y: 0, width: 500, height: 500, prompt: "sky" }] })
    ).toMatchObject({ regionFrame: { width: 1360, height: 768 }, layoutEnabled: true, layoutRegions: [{ id: "l1", action: "change" }] });
  });

  it("carries boxes from drafts saved before regions over as box regions", () => {
    const draft = normalizeFlux3ImageDraft({ boxes: [legacyBox], boxSourceId: "asset-1" });
    const { fuzz: _fuzz, ...bounds } = legacyBox;
    expect(draft.regions).toEqual([{ ...bounds, action: "change", referenceId: null }]);
    expect(draft.regionSourceId).toBe("asset-1");
  });

  it("leads the image rail only when the flag is on", () => {
    expect(imageWorkspaceModes(true)[0]).toBe("flux3_image");
    expect(imageWorkspaceModes(false)).not.toContain("flux3_image");
    // The suite runs with the flag off, as a fresh checkout does.
    expect(workspaceModesForMedia("image")).not.toContain("flux3_image");
    expect(normalizeToolWorkspaceCache({ workspaceMode: "flux3_image" }).workspaceMode).toBe("prompt");
  });
});
