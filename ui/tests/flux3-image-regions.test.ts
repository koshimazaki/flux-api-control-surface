import { describe, expect, it } from "vitest";
import { FLUX3_IMAGE_MIN_BOX } from "@/lib/flux3-image";
import type { Flux3ImageRegion } from "@/lib/flux3-image-boxes";
import { boxFromPoints, defaultMoveTarget, dragResult, regionCardPlacement, resizeBox, resizeRegion } from "@/lib/flux3-image-regions";

const size = { width: 400, height: 300 };
const region = (patch: Partial<Flux3ImageRegion> = {}): Flux3ImageRegion => ({
  id: "box-a",
  x: 100,
  y: 100,
  width: 100,
  height: 80,
  action: "change",
  prompt: "",
  ...patch
});

describe("FLUX 3 Image box geometry", () => {
  it("makes a box from a drag in any direction, and rejects one smaller than the minimum", () => {
    expect(boxFromPoints([{ x: 150, y: 90 }, { x: 50, y: 10 }], size)).toEqual({ x: 50, y: 10, width: 100, height: 80 });
    expect(boxFromPoints([{ x: 10, y: 10 }, { x: 10 + FLUX3_IMAGE_MIN_BOX - 2, y: 60 }], size)).toBeNull();
    expect(boxFromPoints([{ x: 10, y: 10 }], size)).toBeNull();
  });

  it("resizes from an edge or corner and moves as a whole, inside the frame", () => {
    expect(resizeBox(region(), "e", 50, 0, size)).toMatchObject({ x: 100, width: 150 });
    expect(resizeBox(region(), "nw", -20, -30, size)).toMatchObject({ x: 80, y: 70, width: 120, height: 110 });
    expect(resizeBox(region(), "move", 500, 500, size)).toMatchObject({ x: 300, y: 220 });
    // Never smaller than the minimum.
    expect(resizeBox(region(), "w", 200, 0, size).width).toBe(FLUX3_IMAGE_MIN_BOX);
  });

  it("edits a move's target without touching where the element is now", () => {
    const moving = region({ action: "move", target: { x: 250, y: 100, width: 100, height: 80 } });
    const moved = resizeRegion(moving, "target", "move", -40, 20, size);
    expect(moved).toMatchObject({ x: 100, y: 100, target: { x: 210, y: 120 } });
    expect(resizeRegion(moving, "source", "move", 10, 0, size)).toMatchObject({ x: 110, target: { x: 250 } });
  });

  it("places a dragged box where the pointer is, measured from where the drag began", () => {
    // Started at screen x 0 over a frame drawn at half size; the last move came at 25, the release at 80.
    const drag = { part: "source" as const, handle: "move" as const, x: 0, y: 0, scale: 2, origin: region() };
    expect(dragResult(drag, 25, 0, size)).toMatchObject({ x: 150 });
    expect(dragResult(drag, 80, 0, size)).toMatchObject({ x: 260 });
    const target = { ...drag, part: "target" as const, origin: region({ action: "move", target: { x: 0, y: 0, width: 100, height: 80 } }) };
    expect(dragResult(target, 10, 20, size)).toMatchObject({ x: 100, target: { x: 20, y: 40 } });
  });

  it("starts a move a fifth of the frame sideways, leftward when there is no room", () => {
    expect(defaultMoveTarget(region(), size)).toEqual({ x: 180, y: 100, width: 100, height: 80 });
    expect(defaultMoveTarget(region({ x: 290 }), size)).toEqual({ x: 210, y: 100, width: 100, height: 80 });
  });

  it("opens a box's card on the side that keeps it on the image", () => {
    expect(regionCardPlacement(region(), size)).toEqual({ vertical: "below", horizontal: "start" });
    expect(regionCardPlacement(region({ x: 280, y: 200 }), size)).toEqual({ vertical: "above", horizontal: "end" });
  });
});
