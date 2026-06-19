import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { vectorizeGlyphImage } from "@/lib/glyph-server";

async function sampleGlyphPng() {
  return sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([
      {
        input: Buffer.from(
          '<svg width="48" height="48" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="8" width="28" height="32" rx="4" fill="black"/></svg>'
        )
      }
    ])
    .png()
    .toBuffer();
}

describe("vectorizeGlyphImage", () => {
  it("traces a raster image into SVG and a PNG preview", async () => {
    const result = await vectorizeGlyphImage(await sampleGlyphPng(), {
      colors: 2,
      minArea: 0,
      knockoutBackground: true,
      targetMode: "native"
    });

    expect(result.colors).toBe(2);
    expect(result.svg).toContain("<svg");
    expect(result.svg).toContain("<path");
    expect(result.outputWidth).toBe(48);
    expect(result.outputHeight).toBe(48);
    expect(result.pngBuffer.length).toBeGreaterThan(100);
  });

  it("uses an optional crop selection and square target", async () => {
    const result = await vectorizeGlyphImage(await sampleGlyphPng(), {
      colors: 4,
      selection: { x: 8, y: 8, width: 32, height: 32 },
      targetMode: "square"
    });

    expect(result.selection).toEqual({ x: 8, y: 8, width: 32, height: 32 });
    expect(result.cropWidth).toBe(32);
    expect(result.outputWidth).toBe(1024);
    expect(result.outputHeight).toBe(1024);
  });
});
