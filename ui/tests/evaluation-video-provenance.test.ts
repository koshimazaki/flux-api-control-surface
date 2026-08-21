import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/queue/evaluation", () => ({
  unsuccessfulQueueEvaluations: vi.fn().mockResolvedValue([])
}));

const { readKeyframes } = await import("@/lib/generation-evaluation-server");

describe("video keyframe provenance in the evaluation read model", () => {
  it("zips the adapter's parallel keyframe id and second arrays into a timeline", () => {
    // What the FLUX 3 adapter actually writes.
    expect(
      readKeyframes({
        keyframeAssetIds: ["asset-a", "asset-b", "asset-c"],
        keyframeSeconds: [0, 2.5, 8]
      })
    ).toEqual([
      { assetId: "asset-a", seconds: 0 },
      { assetId: "asset-b", seconds: 2.5 },
      { assetId: "asset-c", seconds: 8 }
    ]);
  });

  it("keeps ids when a batch used even spacing and stored no timestamps", () => {
    expect(readKeyframes({ keyframeAssetIds: ["a", "b"] })).toEqual([
      { assetId: "a", seconds: undefined },
      { assetId: "b", seconds: undefined }
    ]);
  });

  it("still reads records written in the older keyframes-object form", () => {
    expect(readKeyframes({ keyframes: [{ assetId: "old-a", seconds: 1 }] })).toEqual([
      { assetId: "old-a", seconds: 1 }
    ]);
  });

  it("caps a timeline at the ten-keyframe API maximum", () => {
    const ids = Array.from({ length: 14 }, (_, index) => `a${index}`);
    expect(readKeyframes({ keyframeAssetIds: ids })).toHaveLength(10);
  });

  it("returns nothing for a generation with no keyframes at all", () => {
    expect(readKeyframes({})).toEqual([]);
  });
});
