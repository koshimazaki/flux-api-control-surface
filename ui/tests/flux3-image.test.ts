import { describe, expect, it } from "vitest";
import {
  FLUX3_IMAGE_API,
  FLUX3_IMAGE_API_PENDING,
  FLUX3_IMAGE_FUZZ_MAX,
  boxFromDrag,
  buildFlux3ImagePayload,
  clampFuzz,
  estimateFlux3ImageUsd,
  flux3ImageRequestBlocker,
  hardenMaskPixels,
  type Flux3ImageApi,
  type Flux3ImageBox
} from "@/lib/flux3-image";

const SOURCE = "data:image/png;base64,AAAA";
const box = (patch: Partial<Flux3ImageBox> = {}): Flux3ImageBox => ({
  id: "box-a",
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
  toPayload: (request) => ({ mode: request.mode, boxes: request.boxes?.length ?? 0 }),
  estimateUsd: () => 0.05
};

describe("FLUX 3 Image request blocker", () => {
  it("names the missing input for each mode before anything else", () => {
    expect(flux3ImageRequestBlocker({ mode: "t2i", prompt: " " })).toBe("Describe the image you want.");
    expect(flux3ImageRequestBlocker({ mode: "edit", prompt: "sunset" })).toBe("Load a source image to edit.");
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE })).toBe("Describe the edit.");
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, selection: "boxes", boxes: [] })).toBe(
      "Draw a box around the area to change."
    );
    expect(
      flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, selection: "boxes", boxes: [box(), box({ id: "b", prompt: "" })] })
    ).toBe("Type the edit into box 2.");
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, selection: "pixels", prompt: "x" })).toBe(
      "Paint the pixels to change."
    );
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, selection: "pixels", mask: SOURCE })).toBe(
      "Describe the edit for the painted pixels."
    );
  });

  it("blocks complete requests until the API is published, and never guesses a payload", () => {
    const complete = { mode: "precise" as const, source: SOURCE, selection: "boxes" as const, boxes: [box()] };
    expect(FLUX3_IMAGE_API).toBeNull();
    expect(flux3ImageRequestBlocker(complete)).toBe(FLUX3_IMAGE_API_PENDING);
    expect(estimateFlux3ImageUsd(complete)).toBeNull();
    expect(() => buildFlux3ImagePayload(complete)).toThrow(FLUX3_IMAGE_API_PENDING);
  });

  it("builds through the API interface once one is supplied", () => {
    const complete = { mode: "precise" as const, source: SOURCE, selection: "boxes" as const, boxes: [box()] };
    expect(flux3ImageRequestBlocker(complete, testApi)).toBeNull();
    expect(estimateFlux3ImageUsd(complete, testApi)).toBe(0.05);
    expect(buildFlux3ImagePayload(complete, testApi)).toEqual({
      endpoint: "test-endpoint",
      payload: { mode: "precise", boxes: 1 }
    });
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
