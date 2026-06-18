export type Rect = { x: number; y: number; width: number; height: number };

/** Build a positive-area rect from two corner points (drag start/end), rounded to whole px. */
export function normalizeSelection(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    x: Math.round(Math.min(ax, bx)),
    y: Math.round(Math.min(ay, by)),
    width: Math.round(Math.abs(bx - ax)),
    height: Math.round(Math.abs(by - ay))
  };
}

/** Clamp a rect so it stays fully inside a width x height image (never negative size). */
export function clampRectToBounds(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(rect.x, width));
  const y = Math.max(0, Math.min(rect.y, height));
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.width, width - x)),
    height: Math.max(0, Math.min(rect.height, height - y))
  };
}

/** A selection is usable only if it covers a meaningful area. */
export function isUsableSelection(rect: Rect | null, min = 4): rect is Rect {
  return !!rect && rect.width >= min && rect.height >= min;
}

/**
 * Center a source-sized box inside a target box with uniform padding, preserving aspect
 * ratio (contain). Returns the destination rect to draw the glyph into.
 */
export function placementRect(
  srcWidth: number,
  srcHeight: number,
  targetWidth: number,
  targetHeight: number,
  padding = 0
): Rect {
  const availW = Math.max(1, targetWidth - padding * 2);
  const availH = Math.max(1, targetHeight - padding * 2);
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { x: padding, y: padding, width: availW, height: availH };
  }
  const scale = Math.min(availW / srcWidth, availH / srcHeight);
  const width = srcWidth * scale;
  const height = srcHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height
  };
}

/** Target canvas size for a placed glyph: a fixed square or the selection's native size. */
export function targetSizeFor(mode: "square" | "native", selection: Rect, square = 1024): { width: number; height: number } {
  if (mode === "native") return { width: Math.max(1, selection.width), height: Math.max(1, selection.height) };
  return { width: square, height: square };
}
