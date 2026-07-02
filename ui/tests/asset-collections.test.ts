import { describe, expect, it } from "vitest";
import {
  collectionCoverAssetIds,
  collectionMemberCounts,
  collectionMemberFromAsset,
  collectionMembersFromAssets,
  createAssetCollection,
  inferCollectionMemberKind,
  mergeCollectionMembers,
  normalizeAssetCollections,
  removeCollectionMember
} from "@/lib/asset-collections";
import { buildAssetCollectionZipEntries } from "@/lib/asset-collection-export";
import type { AssetRecord } from "@/lib/types";

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "asset-a",
    title: "Asset A",
    createdAt: "2026-06-30T00:00:00.000Z",
    timestamp: 1,
    imageDataUrl: "data:image/png;base64,AA==",
    imageUrl: "",
    image_url: "",
    sampleUrl: "",
    model: "local-input",
    prompt: "",
    status: "complete",
    provider: "local-file",
    payload: {},
    references: [],
    ...overrides
  };
}

describe("asset collections", () => {
  it("infers collection lanes from asset kind and provider", () => {
    expect(inferCollectionMemberKind(asset({ assetKind: "input" }))).toBe("input");
    expect(inferCollectionMemberKind(asset({ assetKind: "asset", operation: "glyphs" }))).toBe("asset");
    expect(inferCollectionMemberKind(asset({ assetKind: "output" }))).toBe("generation");
    expect(inferCollectionMemberKind(asset({ provider: "bfl-api", model: "flux-2-pro" }))).toBe("generation");
  });

  it("builds member snapshots without copying image data", () => {
    const member = collectionMemberFromAsset(asset({ id: "asset-b", title: "Blue ref", localImagePath: "outputs/blue.png" }), "input", 10);

    expect(member).toEqual({
      assetId: "asset-b",
      kind: "input",
      name: "Blue ref",
      localImagePath: "outputs/blue.png",
      addedAt: 10
    });
  });

  it("builds member snapshots from freshly imported assets", () => {
    const members = collectionMembersFromAssets(
      [
        asset({ id: "fresh-a", title: "Fresh A", localImagePath: "outputs/fresh-a.png" }),
        asset({ id: "fresh-a", title: "Fresh A duplicate" }),
        asset({ id: "fresh-b", title: "Fresh B", assetKind: "asset" })
      ],
      "input",
      10
    );

    expect(members).toEqual([
      {
        assetId: "fresh-a",
        kind: "input",
        name: "Fresh A",
        localImagePath: "outputs/fresh-a.png",
        addedAt: 10
      },
      {
        assetId: "fresh-b",
        kind: "input",
        name: "Fresh B",
        localImagePath: null,
        addedAt: 11
      }
    ]);
  });

  it("dedupes members by asset id while preserving original order", () => {
    const merged = mergeCollectionMembers(
      [
        { assetId: "a", kind: "input", addedAt: 1 },
        { assetId: "b", kind: "generation", addedAt: 2 }
      ],
      [
        { assetId: "a", kind: "generation", name: "Updated A", addedAt: 99 },
        { assetId: "c", kind: "input", addedAt: 3 }
      ]
    );

    expect(merged.map((member) => member.assetId)).toEqual(["a", "b", "c"]);
    expect(merged[0]).toMatchObject({ kind: "generation", name: "Updated A", addedAt: 1 });
  });

  it("normalizes collections, counts lanes, and removes members from cover", () => {
    const collection = createAssetCollection({
      id: "collection-a",
      name: "Mood Board",
      cover: ["a", "b"],
      members: [
        { assetId: "a", kind: "input", addedAt: 1 },
        { assetId: "b", kind: "generation", addedAt: 2 }
      ]
    });

    expect(collectionCoverAssetIds(collection)).toEqual(["a", "b"]);
    expect(collectionMemberCounts(collection)).toEqual({ inputs: 1, generations: 1 });

    const removed = removeCollectionMember(collection, "a");
    expect(removed.members.map((member) => member.assetId)).toEqual(["b"]);
    expect(removed.cover).toEqual(["b"]);
  });

  it("drops deleted, duplicate, and malformed records during list normalization", () => {
    const collections = normalizeAssetCollections([
      { id: "one", name: "One", members: [], updatedAt: 1 },
      { id: "one", name: "Duplicate", members: [], updatedAt: 2 },
      { id: "deleted", name: "Deleted", members: [], deletedAt: 3 },
      null
    ]);

    expect(collections).toHaveLength(1);
    expect(collections[0].id).toBe("one");
  });

  it("exports collection entries by lane with a handoff manifest", async () => {
    const collection = createAssetCollection({
      id: "collection-export",
      name: "Export Set",
      members: [
        { assetId: "asset-a", kind: "generation", name: "Generated A", addedAt: 1 },
        { assetId: "asset-c", kind: "asset", name: "Glyph C", addedAt: 2 },
        { assetId: "missing", kind: "input", name: "Missing", addedAt: 3 }
      ]
    });

    const result = await buildAssetCollectionZipEntries(collection, [
      asset({ id: "asset-a", assetKind: "output", model: "flux-2-pro", prompt: "A generated prompt" }),
      asset({
        id: "asset-c",
        title: "Glyph C",
        assetKind: "asset",
        operation: "glyphs",
        imageDataUrl: "data:image/png,not%20base64",
        prompt: ""
      })
    ]);

    const names = result.entries.map((entry) => entry.name);
    const manifestEntry = result.entries.find((entry) => entry.name === "manifest.json");
    expect(manifestEntry).toBeTruthy();
    const manifest = JSON.parse(new TextDecoder().decode(manifestEntry!.bytes));

    expect(names).toContain("collection.json");
    expect(names).toContain("manifest.json");
    expect(names.some((name) => name.startsWith("generations/"))).toBe(true);
    expect(names.some((name) => name.startsWith("assets/"))).toBe(true);
    expect(names.some((name) => name.startsWith("prompts/"))).toBe(true);
    expect(result.skipped).toEqual(["missing"]);
    expect(manifest.counts).toEqual({ members: 3, exported: 2, skipped: 1 });
    expect(manifest.items.map((item: { kind: string }) => item.kind)).toEqual(["generation", "asset"]);
    expect(manifest.skipped[0]).toMatchObject({ assetId: "missing", kind: "input" });
  });
});
