import { describe, expect, it } from "vitest";
import {
  clampRectToBounds,
  isUsableSelection,
  normalizeSelection,
  placementRect,
  targetSizeFor
} from "@/lib/glyph-geometry";

describe("normalizeSelection", () => {
  it("orders corners into a positive-area rect", () => {
    expect(normalizeSelection(100, 80, 20, 10)).toEqual({ x: 20, y: 10, width: 80, height: 70 });
  });
  it("rounds to whole pixels", () => {
    expect(normalizeSelection(10.4, 10.6, 30.5, 40.2)).toEqual({ x: 10, y: 11, width: 20, height: 30 });
  });
});

describe("clampRectToBounds", () => {
  it("keeps a rect inside the image", () => {
    expect(clampRectToBounds({ x: -10, y: 5, width: 50, height: 200 }, 100, 100)).toEqual({
      x: 0,
      y: 5,
      width: 50,
      height: 95
    });
  });
  it("never produces negative size when origin is past the edge", () => {
    const r = clampRectToBounds({ x: 150, y: 150, width: 40, height: 40 }, 100, 100);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
  });
});

describe("isUsableSelection", () => {
  it("requires a minimum area", () => {
    expect(isUsableSelection(null)).toBe(false);
    expect(isUsableSelection({ x: 0, y: 0, width: 2, height: 50 })).toBe(false);
    expect(isUsableSelection({ x: 0, y: 0, width: 10, height: 10 })).toBe(true);
  });
});

describe("placementRect", () => {
  it("centers and contains a wide glyph in a square target with padding", () => {
    // 200x100 glyph into 1024 square, padding 12 -> avail 1000, scale 5 -> 1000x500, centered
    const r = placementRect(200, 100, 1024, 1024, 12);
    expect(r.width).toBeCloseTo(1000, 5);
    expect(r.height).toBeCloseTo(500, 5);
    expect(r.x).toBeCloseTo(12, 5);
    expect(r.y).toBeCloseTo(262, 5);
  });
  it("falls back to the padded box when the glyph has no size", () => {
    expect(placementRect(0, 0, 100, 100, 10)).toEqual({ x: 10, y: 10, width: 80, height: 80 });
  });
});

describe("targetSizeFor", () => {
  const sel = { x: 0, y: 0, width: 300, height: 220 };
  it("square mode uses the fixed square", () => {
    expect(targetSizeFor("square", sel)).toEqual({ width: 1024, height: 1024 });
    expect(targetSizeFor("square", sel, 512)).toEqual({ width: 512, height: 512 });
  });
  it("native mode uses the selection size", () => {
    expect(targetSizeFor("native", sel)).toEqual({ width: 300, height: 220 });
  });
});
