import { composeEditPrompt } from "@/lib/flux3-image-boxes";
import { describe, it, expect } from "vitest";
import { recreateImageDraft, recreationReferences } from "@/lib/recreate";
import { normalizeFlux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import type { AssetRecord } from "@/lib/types";
const asset = { id: "result", model: "flux-3-image-klein", prompt: "bee", payload: {}, references: [] } as unknown as AssetRecord;
describe("Recreate image setup", () => {
  it("restores a precise edit's prompt, source, ordered references, seed and box geometry", () => {
    const draft = normalizeFlux3ImageDraft({ mode: "precise", prompts: { precise: "warm light" }, regionSourceId: "source", references: ["a", "b"], regionFrame: { width: 1000, height: 800 },
      regions: [{ id: "box", action: "change", x: 2, y: 3, width: 40, height: 50, prompt: "red wing", referenceId: "b" }], settings: { model: "flux-3-image-klein", seed: 0, resolution: "2k" } });
    const restored = recreateImageDraft({ ...asset, sourceAssetId: "source", seed: 0, runSettings: { flux3Image: { draft } } });
    expect(restored.draft).toEqual(draft);
    expect(restored.warnings).toEqual([]);
  });
  it("recovers older compiled edit boxes with their original reference mapping", () => {
    const refs = [{ id: "source", name: "source", value: "/api/outputs/source/image", assetId: "source" }, { id: "other", name: "other", value: "/api/outputs/other/image", assetId: "other" }];
    const prompt = composeEditPrompt("match lighting", [{ id: "a", x: 20, y: 30, width: 400, height: 500, action: "change", prompt: "add background", reference: refs[1].value }], { width: 1000, height: 1000 }, refs.map((ref) => ref.value));
    const restored = recreateImageDraft({ ...asset, prompt, sourceAssetId: "source", references: refs, runSettings: { flux3Image: { mode: "precise", boxes: 1, imageCount: 2, frame: { width: 1000, height: 1000 } } } });
    expect(restored.warnings).toEqual([]);
    expect(restored.draft.prompts.precise).toBe("match lighting");
    expect(restored.draft.regions[0]).toMatchObject({ x: 20, y: 30, width: 400, height: 500, referenceId: "other" });
  });
  it("rebuilds legacy references from asset IDs and names missing box geometry", () => {
    const old = { ...asset, references: [{ id: "r", name: "Reference", value: "[base64 redacted]", assetId: "original" }], runSettings: { flux3Image: { mode: "i2i", imageCount: 2, boxes: 1 } } };
    expect(recreationReferences(old)[0].value).toBe("/api/outputs/original/image");
    const restored = recreateImageDraft(old);
    expect(restored.draft.references[0]).toBe("original");
    expect(restored.warnings).toHaveLength(2);
  });
});
