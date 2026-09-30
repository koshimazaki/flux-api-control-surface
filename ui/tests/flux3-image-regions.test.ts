import { describe, expect, it } from "vitest";
import { FLUX3_IMAGE_MIN_BOX } from "@/lib/flux3-image";
import { addPathToRegion, regionFromShape, regionPaths, resizeRegion } from "@/lib/flux3-image-regions";

const size = { width: 400, height: 300 };
const square = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 200 },
  { x: 100, y: 200 }
];

describe("precise-edit regions", () => {
  it("makes a box from a drag, and rejects one smaller than the minimum", () => {
    expect(regionFromShape("box", [[{ x: 150, y: 90 }, { x: 50, y: 10 }]], size)).toEqual({
      kind: "box",
      x: 50,
      y: 10,
      width: 100,
      height: 80
    });
    expect(regionFromShape("box", [[{ x: 10, y: 10 }, { x: 12, y: 60 }]], size)).toBeNull();
  });

  it("stores a lasso relative to its bounds and draws it back in image pixels", () => {
    const lasso = regionFromShape("lasso", [square], size);
    expect(lasso).toMatchObject({ kind: "lasso", x: 100, y: 100, width: 100, height: 100 });
    expect(lasso?.paths?.[0]).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ]);
    expect(regionPaths(lasso!)[0][2]).toEqual({ x: 200, y: 200 });
    expect(regionFromShape("lasso", [square.slice(0, 2)], size)).toBeNull();
  });

  it("pads brush strokes by half the brush, so a single dab is still a region", () => {
    expect(regionFromShape("paint", [[{ x: 50, y: 60 }]], size, 20)).toMatchObject({
      kind: "paint",
      x: 40,
      y: 50,
      width: 20,
      height: 20,
      brush: 20
    });
  });

  it("scales the shape with the region when an edge is dragged", () => {
    const lasso = regionFromShape("lasso", [square], size)!;
    const wider = resizeRegion(lasso, "e", 100, 0, size);
    expect(wider).toMatchObject({ x: 100, width: 200, height: 100 });
    expect(regionPaths(wider)[0][1]).toEqual({ x: 300, y: 100 });
  });

  it("keeps resized and moved regions inside the image and above the minimum size", () => {
    const box = regionFromShape("box", [[{ x: 100, y: 100 }, { x: 200, y: 200 }]], size)!;
    expect(resizeRegion(box, "nw", -500, -500, size)).toMatchObject({ x: 0, y: 0, width: 200, height: 200 });
    expect(resizeRegion(box, "w", 500, 0, size)).toMatchObject({ x: 200 - FLUX3_IMAGE_MIN_BOX, width: FLUX3_IMAGE_MIN_BOX });
    expect(resizeRegion(box, "move", 500, 500, size)).toMatchObject({ x: 300, y: 200, width: 100, height: 100 });
  });

  it("adds a shift-drawn stroke to a region and grows its bounds", () => {
    const paint = regionFromShape("paint", [[{ x: 50, y: 50 }, { x: 60, y: 50 }]], size, 10)!;
    const grown = addPathToRegion(paint, [{ x: 150, y: 120 }], size);
    expect(grown.paths).toHaveLength(2);
    expect(grown).toMatchObject({ x: 45, y: 45, width: 110, height: 80, brush: 10 });
  });
});
