/**
 * The waiting field: a grid of cells under a slow drifting light, and the
 * reveal that clears it. Ported from FLUX Studio Lite (src/effects/dither.ts),
 * itself adapted from an earlier Koshi interface experiment; MIT, like this repo.
 *
 * The field's own light is its reveal order, so an arriving picture does not
 * replace the waiting pattern: the brightest cells clear first and the rest
 * follow. Cells are painted directly; nothing is read back from the canvas.
 */
export type Rgb = readonly [number, number, number];
/** The ground behind the cells, and the cell tone from no light to full light. */
export type DitherPalette = { base: Rgb; low: Rgb; high: Rgb };

export const DEFAULT_DITHER_PALETTE: DitherPalette = { base: [21, 23, 24], low: [26, 28, 29], high: [102, 104, 105] };

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** How long the reveal runs once the picture is ready, in milliseconds. */
export const DITHER_REVEAL_MS = 700;

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** The ordered-dither grain of a cell, 0 to just under 1. */
export const ditherGrain = (col: number, row: number) => BAYER[(row % 4) * 4 + (col % 4)] / 16;

/** How much of the drifting light falls on a point of the field (x and y from 0 to 1) at a time in seconds. */
export function ditherLight(x: number, y: number, time: number) {
  const xCenter = 0.5 + Math.sin(time * 0.085) * 0.65;
  const yCenter = 0.5 + Math.sin(time * 0.065 + 1.8) * 0.65;
  const mix = (Math.sin(time * 0.11) + 1) / 2;
  const xBand = Math.max(0, 1 - Math.abs(x - xCenter) / 0.78);
  const yBand = Math.max(0, 1 - Math.abs(y - yCenter) / 0.78);
  return Math.pow(xBand * mix + yBand * (1 - mix), 1.6);
}

/** A cell's opacity partway through the reveal (0 to 1): lit cells clear first, the grain breaks up the edge. */
export function ditherCellAlpha(light: number, grain: number, reveal: number) {
  return 1 - smooth((reveal - (light * 0.8 + grain * 0.2) * 0.65) / 0.35);
}

/** The ground's opacity: it lifts in the first third of the reveal, leaving the cells over the picture. */
export const ditherGroundAlpha = (reveal: number) => 1 - smooth(reveal / 0.35);

type DitherContext = Pick<CanvasRenderingContext2D, "canvas" | "clearRect" | "fillRect" | "fillStyle">;

export function drawDitherField(ctx: DitherContext, time: number, reveal = 0, palette: DitherPalette = DEFAULT_DITHER_PALETTE) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (reveal >= 1) return;
  const [baseR, baseG, baseB] = palette.base;
  ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${ditherGroundAlpha(reveal)})`;
  ctx.fillRect(0, 0, width, height);
  const cell = Math.max(4, Math.min(width, height) / 34);
  const gap = Math.max(0.5, cell * 0.13);
  for (let row = 0, y = 0; y < height; row++, y += cell) {
    for (let col = 0, x = 0; x < width; col++, x += cell) {
      const light = ditherLight(x / width, y / height, time);
      const grain = ditherGrain(col, row);
      const tone = palette.low.map((low, channel) => Math.round(low + (palette.high[channel] - low) * light + grain * 7));
      ctx.fillStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},${ditherCellAlpha(light, grain, reveal)})`;
      ctx.fillRect(x, y, cell - gap, cell - gap);
    }
  }
}

/** A palette from three "r g b" custom properties, falling back to the default per colour. */
export function ditherPaletteFrom(read: (name: string) => string): DitherPalette {
  const rgb = (name: string, fallback: Rgb): Rgb => {
    const parts = read(name).trim().split(/[\s,]+/).map(Number);
    return parts.length === 3 && parts.every((part) => Number.isFinite(part)) ? [parts[0], parts[1], parts[2]] : fallback;
  };
  return {
    base: rgb("--wait-field-base", DEFAULT_DITHER_PALETTE.base),
    low: rgb("--wait-field-low", DEFAULT_DITHER_PALETTE.low),
    high: rgb("--wait-field-high", DEFAULT_DITHER_PALETTE.high)
  };
}
