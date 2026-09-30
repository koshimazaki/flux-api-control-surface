import { clampValue, type Size } from "@/lib/canvas-geometry";
import {
  FLUX3_IMAGE_MIN_BOX,
  boxFromDrag,
  type Flux3ImageRegion,
  type Flux3RegionKind,
  type ImagePoint,
  type RegionPoint
} from "@/lib/flux3-image";

/**
 * Region geometry for precise edits. Bounds are in source pixels; lasso and
 * brush shapes are stored relative to the bounds, so resizing a region from
 * its edges scales its shape with it.
 */
export type RegionShape = Pick<Flux3ImageRegion, "kind" | "x" | "y" | "width" | "height" | "paths" | "brush">;
export type RegionHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";
export const REGION_RESIZE_HANDLES: RegionHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Bounds = { x: number; y: number; width: number; height: number };

function round(value: number, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function boundsOf(paths: ImagePoint[][], pad: number, size: Size): Bounds | null {
  const points = paths.flat();
  if (!points.length) return null;
  const left = clampValue(Math.min(...points.map((point) => point.x)) - pad, 0, size.width);
  const top = clampValue(Math.min(...points.map((point) => point.y)) - pad, 0, size.height);
  const right = clampValue(Math.max(...points.map((point) => point.x)) + pad, 0, size.width);
  const bottom = clampValue(Math.max(...points.map((point) => point.y)) + pad, 0, size.height);
  const x = Math.floor(left);
  const y = Math.floor(top);
  return { x, y, width: Math.max(1, Math.ceil(right) - x), height: Math.max(1, Math.ceil(bottom) - y) };
}

function normalize(path: ImagePoint[], bounds: Bounds): RegionPoint[] {
  return path.map((point) => [
    round((point.x - bounds.x) / bounds.width),
    round((point.y - bounds.y) / bounds.height)
  ]);
}

/** A region's lasso outlines or brush strokes in source pixels. */
export function regionPaths(region: RegionShape): ImagePoint[][] {
  return (region.paths ?? []).map((path) =>
    path.map(([px, py]) => ({ x: region.x + px * region.width, y: region.y + py * region.height }))
  );
}

/**
 * The shape a drawn gesture makes, or null when it is too small to be a region:
 * a box from its drag corners, a lasso from one outline, paint from strokes.
 */
export function regionFromShape(kind: Flux3RegionKind, paths: ImagePoint[][], size: Size, brush = 0): RegionShape | null {
  if (kind === "box") {
    const [start, end] = paths[0] ?? [];
    const box = start && end ? boxFromDrag(start, end, size) : null;
    return box ? { kind, ...box } : null;
  }
  const usable = kind === "lasso" ? paths.filter((path) => path.length >= 3) : paths.filter((path) => path.length);
  const pad = kind === "paint" ? Math.max(1, brush / 2) : 0;
  const bounds = boundsOf(usable, pad, size);
  if (!bounds) return null;
  if (kind === "lasso" && (bounds.width < FLUX3_IMAGE_MIN_BOX || bounds.height < FLUX3_IMAGE_MIN_BOX)) return null;
  return {
    kind,
    ...bounds,
    paths: usable.map((path) => normalize(path, bounds)),
    ...(kind === "paint" ? { brush: Math.round(brush) } : {})
  };
}

/** Adds another outline or stroke to a lasso or paint region, growing its bounds. */
export function addPathToRegion<T extends RegionShape>(region: T, path: ImagePoint[], size: Size): T {
  const next = regionFromShape(region.kind, [...regionPaths(region), path], size, region.brush ?? 0);
  return next ? { ...region, ...next } : region;
}

/**
 * Drags an edge, a corner or the whole region by a delta in source pixels,
 * keeping it inside the image and at least the minimum size.
 */
export function resizeRegion<T extends RegionShape>(region: T, handle: RegionHandle, dx: number, dy: number, size: Size): T {
  const min = FLUX3_IMAGE_MIN_BOX;
  if (handle === "move") {
    return {
      ...region,
      x: Math.round(clampValue(region.x + dx, 0, size.width - region.width)),
      y: Math.round(clampValue(region.y + dy, 0, size.height - region.height))
    };
  }
  let left = region.x;
  let top = region.y;
  let right = region.x + region.width;
  let bottom = region.y + region.height;
  if (handle.includes("w")) left = clampValue(left + dx, 0, right - min);
  if (handle.includes("e")) right = clampValue(right + dx, left + min, size.width);
  if (handle.includes("n")) top = clampValue(top + dy, 0, bottom - min);
  if (handle.includes("s")) bottom = clampValue(bottom + dy, top + min, size.height);
  return {
    ...region,
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}

export function regionKindLabel(kind: Flux3RegionKind) {
  return kind === "box" ? "Box" : kind === "lasso" ? "Lasso" : "Brush";
}
