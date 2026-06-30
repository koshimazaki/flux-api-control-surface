import { describe, expect, it } from "vitest";
import { shouldRelinkReferenceValue, stripReferenceForStorage } from "@/lib/dashboard/use-references";
import type { AssetRecord, ReferenceImage } from "@/lib/types";

function asset(partial: Partial<AssetRecord> & { id: string }): AssetRecord {
  return {
    createdAt: "2026-06-30",
    timestamp: 0,
    imageDataUrl: "",
    imageUrl: "",
    image_url: "",
    sampleUrl: "",
    model: "flux",
    prompt: "",
    status: "complete",
    payload: {},
    references: [],
    ...partial
  };
}

function ref(partial: Partial<ReferenceImage>): ReferenceImage {
  return { id: "r1", name: "ref", value: "", ...partial };
}

const DATA = "data:image/png;base64,HEAVYPAYLOAD";

describe("stripReferenceForStorage keeps a restored reference resolvable", () => {
  it("stores the durable /api/outputs URL for a server output (has localImagePath)", () => {
    const assets = [asset({ id: "out-1", localImagePath: "outputs/x.png", imageDataUrl: DATA })];
    const stored = stripReferenceForStorage(ref({ value: DATA, assetId: "out-1" }), assets);
    expect(stored.value).toBe("/api/outputs/out-1/image");
  });

  it("prefers the durable server output URL even when a remote URL is also present", () => {
    const assets = [
      asset({ id: "out-2", localImagePath: "outputs/y.png", remoteImageUrl: "https://r2.example/y.png", imageDataUrl: DATA })
    ];
    const stored = stripReferenceForStorage(ref({ value: DATA, assetId: "out-2" }), assets);
    expect(stored.value).toBe("/api/outputs/out-2/image");
  });

  it("falls back to a fetchable remote http URL when there is no local output file", () => {
    const assets = [asset({ id: "rem-1", remoteImageUrl: "https://r2.example/z.png", imageDataUrl: DATA })];
    const stored = stripReferenceForStorage(ref({ value: DATA, assetId: "rem-1" }), assets);
    expect(stored.value).toBe("https://r2.example/z.png");
  });

  it("uses any http(s) asset url before giving up", () => {
    const assets = [asset({ id: "rem-2", imageUrl: "https://cdn.bfl.ai/sample.png", imageDataUrl: DATA })];
    const stored = stripReferenceForStorage(ref({ value: DATA, assetId: "rem-2" }), assets);
    expect(stored.value).toBe("https://cdn.bfl.ai/sample.png");
  });

  it("keeps the data URL for a browser-only asset so it still submits after a refresh", () => {
    // No localImagePath and no http url: a relative /api/outputs/:id/image would
    // NOT resolve server-side for this id, so we must not persist one. (The P2 fix.)
    const assets = [asset({ id: "local-1", imageDataUrl: DATA })];
    const stored = stripReferenceForStorage(ref({ value: DATA, assetId: "local-1" }), assets);
    expect(stored.value).toBe(DATA);
  });

  it("keeps the data URL when the backing asset is not in the loaded set", () => {
    const stored = stripReferenceForStorage(ref({ value: DATA, assetId: "missing" }), []);
    expect(stored.value).toBe(DATA);
  });

  it("leaves uploads without an assetId and already-light values untouched", () => {
    expect(stripReferenceForStorage(ref({ value: DATA }), []).value).toBe(DATA);
    expect(stripReferenceForStorage(ref({ value: "https://x/y.png", assetId: "out-1" }), []).value).toBe("https://x/y.png");
  });
});

describe("shouldRelinkReferenceValue only upgrades empty or placeholder values", () => {
  it("re-links empty and /api/outputs placeholders", () => {
    expect(shouldRelinkReferenceValue("")).toBe(true);
    expect(shouldRelinkReferenceValue(undefined)).toBe(true);
    expect(shouldRelinkReferenceValue("/api/outputs/out-1/image")).toBe(true);
  });

  it("never clobbers a live data URL or a user-typed http URL", () => {
    expect(shouldRelinkReferenceValue(DATA)).toBe(false);
    expect(shouldRelinkReferenceValue("https://example.com/cropped.png")).toBe(false);
  });
});
