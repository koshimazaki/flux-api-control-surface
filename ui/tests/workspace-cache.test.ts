import { describe, expect, it } from "vitest";
import { normalizeToolWorkspaceCache } from "@/lib/dashboard/workspace-cache";

describe("normalizeToolWorkspaceCache", () => {
  it("restores separate shared, VTO, Glyphs, and garment source ids", () => {
    const cache = normalizeToolWorkspaceCache({
      workspaceMode: "vto",
      sharedSourceAssetId: "shared-image",
      vtoSourceAssetId: "person-image",
      glyphSourceAssetId: "glyph-image",
      vtoGarmentAssetIds: ["garment-1", null, "garment-3"],
      vtoPromptText: "wear this",
      outpaintPromptText: "expand",
      outpaintOffsetX: "12",
      outpaintOffsetY: "24",
      outpaintMode: "fast",
      outpaintAutoCrop: true
    });

    expect(cache).toMatchObject({
      workspaceMode: "vto",
      sharedSourceAssetId: "shared-image",
      vtoSourceAssetId: "person-image",
      glyphSourceAssetId: "glyph-image",
      vtoGarmentAssetIds: ["garment-1", null, "garment-3", null],
      vtoPromptText: "wear this",
      outpaintPromptText: "expand",
      outpaintOffsetX: "12",
      outpaintOffsetY: "24",
      outpaintMode: "fast",
      outpaintAutoCrop: true
    });
  });

  it("falls back safely for malformed cache values", () => {
    const cache = normalizeToolWorkspaceCache({
      workspaceMode: "bad",
      sharedSourceAssetId: 123,
      vtoGarmentAssetIds: "not-an-array",
      outpaintMode: "turbo"
    });

    expect(cache.workspaceMode).toBe("prompt");
    expect(cache.sharedSourceAssetId).toBeNull();
    expect(cache.vtoGarmentAssetIds).toEqual([null, null, null, null]);
    expect(cache.outpaintMode).toBe("high");
  });
});
