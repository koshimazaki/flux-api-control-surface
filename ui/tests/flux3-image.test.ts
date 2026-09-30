import { describe, expect, it } from "vitest";
import {
  FLUX3_IMAGE_API,
  FLUX3_IMAGE_API_PENDING,
  FLUX3_IMAGE_FUZZ_MAX,
  FLUX3_IMAGE_MAX_REFERENCES,
  boxFromDrag,
  buildFlux3ImagePayload,
  clampFuzz,
  estimateFlux3ImageUsd,
  flux3ImageRequestBlocker,
  hardenMaskPixels,
  placeReferenceIds,
  type Flux3ImageApi,
  type Flux3ImageRequestRegion
} from "@/lib/flux3-image";

const SOURCE = "data:image/png;base64,AAAA";
const region = (patch: Partial<Flux3ImageRequestRegion> = {}): Flux3ImageRequestRegion => ({
  id: "region-a",
  kind: "box",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  fuzz: 8,
  prompt: "make the scarf red",
  ...patch
});
// Stands in for the real API in tests only; the shipped module keeps it null.
const testApi: Flux3ImageApi = {
  endpoint: "test-endpoint",
  toPayload: (request) => ({ mode: request.mode, regions: request.regions?.length ?? 0 }),
  estimateUsd: () => 0.05
};

describe("FLUX 3 Image request blocker", () => {
  it("names the missing input for each mode before anything else", () => {
    expect(flux3ImageRequestBlocker({ mode: "t2i", prompt: " " })).toBe("Describe the image you want.");
    expect(flux3ImageRequestBlocker({ mode: "i2i", prompt: "the fox from image 1", references: [] })).toBe(
      "Add at least one reference image."
    );
    expect(flux3ImageRequestBlocker({ mode: "i2i", references: [SOURCE] })).toBe(
      "Describe the image to make from the references."
    );
    expect(
      flux3ImageRequestBlocker({
        mode: "i2i",
        prompt: "x",
        references: Array.from({ length: FLUX3_IMAGE_MAX_REFERENCES + 1 }, () => SOURCE)
      })
    ).toBe(`FLUX 3 Image takes up to ${FLUX3_IMAGE_MAX_REFERENCES} references here.`);
    expect(flux3ImageRequestBlocker({ mode: "edit", prompt: "sunset" })).toBe("Load a source image to edit.");
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE })).toBe("Describe the edit.");
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE, mask: SOURCE })).toBe(
      "Describe the edit for the painted area."
    );
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, regions: [] })).toBe(
      "Draw a region: a box, a brush stroke or a lasso."
    );
    expect(
      flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, regions: [region(), region({ id: "b", prompt: "" })] })
    ).toBe("Type the edit into region 2.");
  });

  it("edits the whole image without a mask, and a region needs no reference", () => {
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE, prompt: "dusk light" }, testApi)).toBeNull();
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, regions: [region()] }, testApi)).toBeNull();
  });

  it("blocks complete requests until the API is published, and never guesses a payload", () => {
    const complete = { mode: "precise" as const, source: SOURCE, regions: [region({ reference: SOURCE })] };
    expect(FLUX3_IMAGE_API).toBeNull();
    expect(flux3ImageRequestBlocker(complete)).toBe(FLUX3_IMAGE_API_PENDING);
    expect(estimateFlux3ImageUsd(complete)).toBeNull();
    expect(() => buildFlux3ImagePayload(complete)).toThrow(FLUX3_IMAGE_API_PENDING);
  });

  it("builds through the API interface once one is supplied", () => {
    const complete = { mode: "precise" as const, source: SOURCE, regions: [region({ reference: SOURCE })] };
    expect(flux3ImageRequestBlocker(complete, testApi)).toBeNull();
    expect(estimateFlux3ImageUsd(complete, testApi)).toBe(0.05);
    expect(buildFlux3ImagePayload(complete, testApi)).toEqual({
      endpoint: "test-endpoint",
      payload: { mode: "precise", regions: 1 }
    });
  });
});

describe("reference slots", () => {
  it("supports at least four references", () => {
    expect(FLUX3_IMAGE_MAX_REFERENCES).toBeGreaterThanOrEqual(4);
  });

  it("puts the first id in the target slot and the rest in empty slots, dropping overflow", () => {
    expect(placeReferenceIds([null, "a", null, null], ["x"], 3)).toEqual([null, "a", null, "x"]);
    expect(placeReferenceIds([null, "a", null, null], ["x", "y", "z"], 1)).toEqual(["y", "x", "z", null]);
    expect(placeReferenceIds(["a", "b", "c", "d"], ["x", "y"], 0)).toEqual(["x", "b", "c", "d"]);
  });
});

describe("region geometry", () => {
  it("turns a drag in any direction into a box clamped to the image", () => {
    const size = { width: 400, height: 300 };
    expect(boxFromDrag({ x: 350.4, y: 10 }, { x: 500, y: -20 }, size)).toEqual({ x: 350, y: 0, width: 50, height: 10 });
    expect(boxFromDrag({ x: 120, y: 90 }, { x: 20, y: 30 }, size)).toEqual({ x: 20, y: 30, width: 100, height: 60 });
    expect(boxFromDrag({ x: 10, y: 10 }, { x: 14, y: 90 }, size)).toBeNull();
  });

  it("keeps the fuzz radius inside the slider range", () => {
    expect(clampFuzz(-3)).toBe(0);
    expect(clampFuzz(FLUX3_IMAGE_FUZZ_MAX + 40)).toBe(FLUX3_IMAGE_FUZZ_MAX);
    expect(clampFuzz(Number.NaN)).toBe(8);
  });

  it("makes every mask pixel fully selected or not", () => {
    const pixels = new Uint8ClampedArray([200, 200, 200, 255, 90, 90, 90, 255, 128, 128, 128, 255]);
    expect(Array.from(hardenMaskPixels(pixels))).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  });
});
