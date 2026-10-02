import { clampValue, type Size } from "@/lib/canvas-geometry";
import { FLUX3_IMAGE_MIN_BOX, type Flux3Box, type Flux3ImageRegion } from "@/lib/flux3-image-boxes";
import { boxFromDrag, type ImagePoint } from "@/lib/flux3-image";

/**
 * Box geometry for FLUX 3 Image boxes, in the pixels of the frame they are
 * drawn on (the source image, or the layout frame for text to image). A move
 * has a second box, its target, edited with the same handles.
 */
export type RegionHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";
/** Which of a box's rectangles a drag edits: where it is, or where a move takes it. */
export type BoxPart = "source" | "target";

/** The box a drag between two points makes, or null for a click or a sliver. */
export function boxFromPoints(points: ImagePoint[], size: Size): Flux3Box | null {
  const [start, end] = points;
  return start && end ? boxFromDrag(start, end, size) : null;
}

/** Drags an edge, a corner or the whole box by a delta, keeping it inside the frame and at least the minimum size. */
export function resizeBox<T extends Flux3Box>(box: T, handle: RegionHandle, dx: number, dy: number, size: Size): T {
  const min = FLUX3_IMAGE_MIN_BOX;
  if (handle === "move") {
    return {
      ...box,
      x: Math.round(clampValue(box.x + dx, 0, size.width - box.width)),
      y: Math.round(clampValue(box.y + dy, 0, size.height - box.height))
    };
  }
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle.includes("w")) left = clampValue(left + dx, 0, right - min);
  if (handle.includes("e")) right = clampValue(right + dx, left + min, size.width);
  if (handle.includes("n")) top = clampValue(top + dy, 0, bottom - min);
  if (handle.includes("s")) bottom = clampValue(bottom + dy, top + min, size.height);
  return { ...box, x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) };
}

/** Resizes a box's own rectangle or, for a move, its target. */
export function resizeRegion(region: Flux3ImageRegion, part: BoxPart, handle: RegionHandle, dx: number, dy: number, size: Size) {
  if (part === "target" && region.target) return { ...region, target: resizeBox(region.target, handle, dx, dy, size) };
  return resizeBox(region, handle, dx, dy, size);
}

/**
 * One colour per box, in drawing order, so box 3 on the image and Box 3 in the
 * list read as the same thing. What a box does shows in its label and pattern,
 * not its colour. Mid-tone hues that read on dark and light themes; no red,
 * which would look like Remove.
 */
export const BOX_COLORS = ["#ff9f43", "#48c6ef", "#7bd88f", "#c08cff", "#ffd166", "#2ec4b6", "#ff7eb6", "#8c9eff"] as const;

export function boxColor(index: number) {
  return BOX_COLORS[((index % BOX_COLORS.length) + BOX_COLORS.length) % BOX_COLORS.length];
}

/** Stacking for each box: smaller boxes sit above larger ones, so a box inside another can still be grabbed. */
export function boxLayers(boxes: Flux3Box[]) {
  const order = boxes.map((box, index) => ({ index, area: box.width * box.height })).sort((a, b) => b.area - a.area || a.index - b.index);
  const layers = Array<number>(boxes.length);
  order.forEach(({ index }, rank) => {
    layers[index] = rank + 1;
  });
  return layers;
}

/** A box that fills nearly the whole frame cannot move, so drags inside it draw new boxes instead. */
export function fillsFrame(box: Flux3Box, size: Size) {
  return box.width >= size.width * 0.9 && box.height >= size.height * 0.9;
}

type ScreenRect = { left: number; top: number; width: number; height: number };

/**
 * How far to shift a box's card so it stays inside the visible canvas, given
 * where it is drawn now (with `current` shift applied) and the canvas bounds.
 * Measured against its unshifted place, so the answer is stable across renders.
 */
export function cardShift(card: ScreenRect, bounds: ScreenRect, current: { x: number; y: number }, margin = 8) {
  const fit = (start: number, size: number, low: number, span: number) => {
    const max = low + span - margin - size;
    return Math.max(low + margin, Math.min(start, max)) - start;
  };
  const left = card.left - current.x;
  const top = card.top - current.y;
  return { x: Math.round(fit(left, card.width, bounds.left, bounds.width)), y: Math.round(fit(top, card.height, bounds.top, bounds.height)) };
}

/** A box drag in progress: what is dragged, where the pointer started, and the box as it was. */
export type BoxDrag = { part: BoxPart; handle: RegionHandle; x: number; y: number; scale: number; origin: Flux3ImageRegion };

/** The box after a drag from its start to this pointer position; screen pixels are scaled to the frame. */
export function dragResult(drag: BoxDrag, clientX: number, clientY: number, size: Size) {
  return resizeRegion(drag.origin, drag.part, drag.handle, (clientX - drag.x) * drag.scale, (clientY - drag.y) * drag.scale, size);
}

/** Where a move starts out going: the same size, shifted a fifth of the frame sideways, inside the frame. */
export function defaultMoveTarget(box: Flux3Box, size: Size): Flux3Box {
  const shift = Math.round(size.width / 5);
  const right = box.x + box.width + shift <= size.width;
  return { x: Math.round(clampValue(box.x + (right ? shift : -shift), 0, size.width - box.width)), y: box.y, width: box.width, height: box.height };
}

/**
 * Where the selected box's card opens: below the box unless it sits in the
 * lower part of the frame, and leftward for boxes in the right half, so the
 * card stays on the image.
 */
export function regionCardPlacement(region: Flux3Box, size: Size) {
  return {
    vertical: region.y + region.height > size.height * 0.62 ? ("above" as const) : ("below" as const),
    horizontal: region.x + region.width / 2 > size.width / 2 ? ("end" as const) : ("start" as const)
  };
}
