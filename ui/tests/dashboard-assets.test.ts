import { describe, expect, it } from "vitest";
import { normalizeLibraryRecord } from "@/lib/asset-storage";
import { mergeAssetRecords } from "@/lib/dashboard-assets";
import type { AssetRecord } from "@/lib/types";

function asset(id: string, patch: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id,
    title: id,
    createdAt: "2026-06-19T00:00:00.000Z",
    timestamp: 1,
    imageDataUrl: "",
    imageUrl: `/api/outputs/${id}/image`,
    image_url: `/api/outputs/${id}/image`,
    sampleUrl: `/api/outputs/${id}/image`,
    model: "bfl-api",
    prompt: "",
    status: "complete",
    provider: "bfl-api",
    payload: {},
    references: [],
    ...patch
  };
}

describe("mergeAssetRecords", () => {
  it("prepends newly recovered server outputs", () => {
    const result = mergeAssetRecords([asset("old")], [asset("new")]);

    expect(result.added).toBe(1);
    expect(result.assets.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("refreshes existing records while preserving favorites", () => {
    const result = mergeAssetRecords(
      [asset("glyph", { is_favorite: true })],
      [
        asset("glyph", {
          provider: "local-glyph",
          operation: "glyphs",
          assetKind: "asset",
          localSvgPath: "outputs/glyph.svg"
        })
      ]
    );

    expect(result.added).toBe(0);
    expect(result.assets[0]).toMatchObject({
      id: "glyph",
      provider: "local-glyph",
      operation: "glyphs",
      assetKind: "asset",
      localSvgPath: "outputs/glyph.svg",
      is_favorite: true
    });
  });

  it("keeps local-only glyphs in place when polling refreshes server outputs", () => {
    const result = mergeAssetRecords(
      [
        asset("local-glyph", {
          provider: "local-glyph",
          operation: "glyphs",
          assetKind: "asset",
          imageUrl: ""
        }),
        asset("server-output")
      ],
      [asset("server-output", { title: "refreshed server output" })]
    );

    expect(result.assets.map((item) => item.id)).toEqual(["local-glyph", "server-output"]);
    expect(result.assets[1].title).toBe("refreshed server output");
  });
});

describe("normalizeLibraryRecord", () => {
  it("drops image-less records that cannot hydrate a stored blob", () => {
    expect(normalizeLibraryRecord({ id: "prompt-only", title: "prompt only", prompt: "text" })).toBeNull();
  });

  it("keeps legacy local VTO collage records so IndexedDB hydration can restore the image", () => {
    const asset = normalizeLibraryRecord({
      id: "vto-result-garment-collage",
      title: "VTO garment collage",
      provider: "local-vto-preflight",
      operation: "vto-garment-composite",
      model: "vto-garment-composite",
      prompt: "[vto garment collage sent to BFL]"
    });

    expect(asset).toMatchObject({
      id: "vto-result-garment-collage",
      imageDataUrl: "",
      provider: "local-vto-preflight",
      operation: "vto-garment-composite"
    });
  });
});
