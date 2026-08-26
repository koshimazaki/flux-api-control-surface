import { describe, expect, it } from "vitest";
import { normalizeToolWorkspaceCache } from "@/lib/dashboard/workspace-cache";

describe("normalizeToolWorkspaceCache", () => {
  it("restores separate shared, VTO, Glyphs, and garment source ids", () => {
    const cache = normalizeToolWorkspaceCache({
      workspaceMode: "vto",
      flux3SourceMode: "i2v",
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
      flux3SourceMode: "i2v",
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
      flux3SourceMode: "omni",
      sharedSourceAssetId: 123,
      vtoGarmentAssetIds: "not-an-array",
      outpaintMode: "turbo"
    });

    expect(cache.workspaceMode).toBe("prompt");
    expect(cache.flux3SourceMode).toBe("t2v");
    expect(cache.sharedSourceAssetId).toBeNull();
    expect(cache.vtoGarmentAssetIds).toEqual([null, null, null, null]);
    expect(cache.outpaintMode).toBe("high");
  });

  it("restores the FLUX 3 workspace tab", () => {
    expect(normalizeToolWorkspaceCache({ workspaceMode: "flux3" }).workspaceMode).toBe("flux3");
  });

  it("restores the Video Upscale workspace tab", () => {
    expect(normalizeToolWorkspaceCache({ workspaceMode: "upscale" }).workspaceMode).toBe("upscale");
  });

  it("remembers each valid FLUX 3 source mode", () => {
    expect(normalizeToolWorkspaceCache({ flux3SourceMode: "t2v" }).flux3SourceMode).toBe("t2v");
    expect(normalizeToolWorkspaceCache({ flux3SourceMode: "i2v" }).flux3SourceMode).toBe("i2v");
    expect(normalizeToolWorkspaceCache({ flux3SourceMode: "v2v" }).flux3SourceMode).toBe("v2v");
  });
});
