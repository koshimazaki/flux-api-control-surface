import { describe, expect, it } from "vitest";
import { FLUX3_IMAGE_MIN_BOX } from "@/lib/flux3-image";
import type { Flux3ImageRegion } from "@/lib/flux3-image-boxes";
import {
  BOX_COLORS,
  boxColor,
  boxFromPoints,
  boxLayers,
  cardShift,
  defaultMoveTarget,
  dragResult,
  fillsFrame,
  regionCardPlacement,
  resizeBox,
  resizeRegion
} from "@/lib/flux3-image-regions";

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

  it("gives each new box the next colour, distinct until the palette runs out", () => {
    const colours = Array.from({ length: BOX_COLORS.length }, (_, index) => boxColor(index));
    expect(new Set(colours).size).toBe(BOX_COLORS.length);
    expect(boxColor(BOX_COLORS.length)).toBe(boxColor(0));
  });

  it("stacks smaller boxes above larger ones so a box inside another can be grabbed", () => {
    const background = { x: 0, y: 0, width: 400, height: 300 };
    const inner = { x: 50, y: 50, width: 40, height: 40 };
    const middle = { x: 20, y: 20, width: 200, height: 150 };
    expect(boxLayers([background, inner, middle])).toEqual([1, 3, 2]);
  });

  it("lets drags through a box that fills the frame, since it has nowhere to move", () => {
    expect(fillsFrame({ x: 0, y: 0, width: 400, height: 300 }, size)).toBe(true);
    expect(fillsFrame({ x: 0, y: 0, width: 400, height: 150 }, size)).toBe(false);
  });

  it("shifts a box's card back inside the visible canvas, and settles in one pass", () => {
    const canvas = { left: 0, top: 0, width: 800, height: 600 };
    // Opened above a box near the top: 120 px off the top edge.
    const above = { left: 100, top: -120, width: 272, height: 200 };
    const shift = cardShift(above, canvas, { x: 0, y: 0 });
    expect(shift).toEqual({ x: 0, y: 128 });
    // Measured again with that shift applied, the answer does not change.
    expect(cardShift({ ...above, top: above.top + shift.y }, canvas, shift)).toEqual(shift);
    // Dragged past the right edge, it stops at the edge; a card already inside is left alone.
    expect(cardShift({ left: 700, top: 100, width: 272, height: 200 }, canvas, { x: 0, y: 0 })).toEqual({ x: -180, y: 0 });
    expect(cardShift({ left: 100, top: 100, width: 272, height: 200 }, canvas, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
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
