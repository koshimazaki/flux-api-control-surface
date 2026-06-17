import { describe, expect, it } from "vitest";
import { clampPan, clampValue, displaySize, fitScale, maxPan, screenToCanvasScale } from "@/lib/canvas-geometry";

describe("clampValue", () => {
  it("clamps within bounds", () => {
    expect(clampValue(5, 0, 10)).toBe(5);
    expect(clampValue(-3, 0, 10)).toBe(0);
    expect(clampValue(42, 0, 10)).toBe(10);
  });
});

describe("fitScale", () => {
  it("fits a landscape image to a wider viewport by height", () => {
    // 2000x1000 into 800x800 -> limited by width (800/2000=0.4) vs height (800/1000=0.8) -> 0.4
    expect(fitScale({ width: 2000, height: 1000 }, { width: 800, height: 800 })).toBeCloseTo(0.4, 5);
  });

  it("fits a portrait image limited by height", () => {
    // 1000x2000 into 800x800 -> width 0.8 vs height 0.4 -> 0.4
    expect(fitScale({ width: 1000, height: 2000 }, { width: 800, height: 800 })).toBeCloseTo(0.4, 5);
  });

  it("returns 0 when not yet measured", () => {
    expect(fitScale({ width: 0, height: 0 }, { width: 800, height: 800 })).toBe(0);
    expect(fitScale({ width: 1000, height: 1000 }, { width: 0, height: 0 })).toBe(0);
  });
});

describe("displaySize", () => {
  it("scales by fit and zoom", () => {
    expect(displaySize({ width: 1000, height: 500 }, 0.4, 2)).toEqual({ width: 800, height: 400 });
  });
});

describe("maxPan", () => {
  it("is zero when the image fits (zoom 1)", () => {
    // fit makes the image exactly contained, so no panning room
    const fit = fitScale({ width: 1000, height: 1000 }, { width: 800, height: 800 });
    expect(maxPan({ width: 1000, height: 1000 }, { width: 800, height: 800 }, fit, 1)).toEqual({ x: 0, y: 0 });
  });

  it("grows symmetric pan room when zoomed in", () => {
    const natural = { width: 1000, height: 1000 };
    const viewport = { width: 800, height: 800 };
    const fit = fitScale(natural, viewport); // 0.8 -> display 800 at zoom 1
    // zoom 2 -> display 1600, overflow 800, half each side -> 400
    expect(maxPan(natural, viewport, fit, 2)).toEqual({ x: 400, y: 400 });
  });
});

describe("clampPan", () => {
  it("keeps pan within the symmetric bounds", () => {
    expect(clampPan({ x: 500, y: -500 }, { x: 400, y: 400 })).toEqual({ x: 400, y: -400 });
    expect(clampPan({ x: 100, y: -50 }, { x: 400, y: 400 })).toEqual({ x: 100, y: -50 });
  });
});

describe("screenToCanvasScale", () => {
  it("inverts fit*zoom so a screen delta maps to canvas pixels", () => {
    // at fit 0.5, zoom 2 the image is shown 1:1, so 1 screen px == 1 canvas px
    expect(screenToCanvasScale(0.5, 2)).toBeCloseTo(1, 5);
    // at fit 0.25, zoom 1 the image is shrunk 4x, so 1 screen px == 4 canvas px
    expect(screenToCanvasScale(0.25, 1)).toBeCloseTo(4, 5);
  });

  it("returns 0 when geometry is not ready", () => {
    expect(screenToCanvasScale(0, 1)).toBe(0);
    expect(screenToCanvasScale(0.5, 0)).toBe(0);
  });
});
