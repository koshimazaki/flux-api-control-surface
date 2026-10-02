import { describe, expect, it } from "vitest";
import {
  DEFAULT_DITHER_PALETTE,
  ditherCellAlpha,
  ditherGroundAlpha,
  ditherLight,
  ditherPaletteFrom,
  drawDitherField
} from "@/lib/effects/dither";

/** A canvas context that records what is painted instead of painting it. */
function recorder(width = 68, height = 34) {
  const fills: Array<{ style: string; x: number; y: number; w: number; h: number }> = [];
  let cleared = 0;
  const ctx = {
    canvas: { width, height } as HTMLCanvasElement,
    fillStyle: "" as string | CanvasGradient | CanvasPattern,
    clearRect: () => {
      cleared += 1;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: String(this.fillStyle), x, y, w, h });
    }
  };
  return { ctx, fills, cleared: () => cleared };
}

const alphaOf = (style: string) => Number(style.slice(style.lastIndexOf(",") + 1, -1));

describe("the waiting field", () => {
  it("covers the whole stage while waiting: an opaque ground and a full grid of opaque cells", () => {
    const { ctx, fills } = recorder();
    drawDitherField(ctx, 3);
    expect(fills[0]).toMatchObject({ style: "rgba(21,23,24,1)", x: 0, y: 0, w: 68, h: 34 });
    // 34 px tall at the 4 px minimum cell: 9 rows of 17 cells.
    expect(fills).toHaveLength(1 + 9 * 17);
    expect(fills.slice(1).every((fill) => alphaOf(fill.style) === 1)).toBe(true);
  });

  it("keeps its light inside the palette, and moves it over time", () => {
    for (const time of [0, 12, 40, 95]) {
      for (const [x, y] of [[0, 0], [0.5, 0.5], [1, 1]]) {
        const light = ditherLight(x, y, time);
        expect(light).toBeGreaterThanOrEqual(0);
        expect(light).toBeLessThanOrEqual(1);
      }
    }
    expect(ditherLight(0.5, 0.5, 0)).not.toBe(ditherLight(0.5, 0.5, 20));
  });

  it("reveals in the order of its light: the ground lifts first, lit cells clear before dark ones", () => {
    expect(ditherGroundAlpha(0)).toBe(1);
    expect(ditherGroundAlpha(0.35)).toBe(0);
    const [lit, dark] = [ditherCellAlpha(1, 0, 0.5), ditherCellAlpha(0, 0, 0.5)];
    expect(lit).toBeGreaterThan(dark);
    expect(dark).toBe(0);
    // Before the reveal every cell is solid; by its end every cell is gone.
    expect(ditherCellAlpha(1, 0.9, 0)).toBe(1);
    expect(ditherCellAlpha(1, 0.9, 1)).toBe(0);
  });

  it("paints nothing once the reveal is over", () => {
    const { ctx, fills, cleared } = recorder();
    drawDitherField(ctx, 3, 1);
    expect(cleared()).toBe(1);
    expect(fills).toHaveLength(0);
  });

  it("reads a theme's palette from custom properties, keeping the default for any it cannot read", () => {
    const values: Record<string, string> = { "--wait-field-base": "163 163 163", "--wait-field-low": "170, 170, 170", "--wait-field-high": "white" };
    expect(ditherPaletteFrom((name) => values[name] ?? "")).toEqual({
      base: [163, 163, 163],
      low: [170, 170, 170],
      high: DEFAULT_DITHER_PALETTE.high
    });
  });
});
