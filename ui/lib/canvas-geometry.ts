export type Size = { width: number; height: number };
export type PanOffset = { x: number; y: number };

export const clampValue = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/**
 * "Contain" fit scale: the largest factor at which a `natural`-sized image fits inside a
 * `viewport`-sized box. Returns 0 when any dimension is non-positive (not yet measured).
 */
export function fitScale(natural: Size, viewport: Size): number {
  if (natural.width <= 0 || natural.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 0;
  return Math.min(viewport.width / natural.width, viewport.height / natural.height);
}

/** Displayed size of the image at a given fit scale and zoom level. */
export function displaySize(natural: Size, fit: number, zoom: number): Size {
  return { width: natural.width * fit * zoom, height: natural.height * fit * zoom };
}

/**
 * Maximum pan offset (viewport px) in each axis so the stage can be dragged to reveal its
 * edges but never fully out of the viewport. Zero when the stage fits (nothing to pan).
 */
export function maxPan(natural: Size, viewport: Size, fit: number, zoom: number): PanOffset {
  const display = displaySize(natural, fit, zoom);
  return {
    x: Math.max(0, (display.width - viewport.width) / 2),
    y: Math.max(0, (display.height - viewport.height) / 2)
  };
}

/** Clamp a pan offset to the symmetric bounds returned by {@link maxPan}. */
export function clampPan(pan: PanOffset, bounds: PanOffset): PanOffset {
  return { x: clampValue(pan.x, -bounds.x, bounds.x), y: clampValue(pan.y, -bounds.y, bounds.y) };
}

/**
 * Factor converting a screen-pixel delta into an image/canvas-pixel delta at the current
 * fit + zoom. Used to translate a drag in the viewport into source-offset pixels.
 */
export function screenToCanvasScale(fit: number, zoom: number): number {
  return fit > 0 && zoom > 0 ? 1 / (fit * zoom) : 0;
}
