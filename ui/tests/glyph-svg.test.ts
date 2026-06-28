import { describe, expect, it } from "vitest";
import {
  cleanTraceSvg,
  glyphPreviewBackgroundForAsset,
  glyphPreviewBackgroundForSvg
} from "@/lib/glyph-svg";
import type { AssetRecord } from "@/lib/types";

function glyphAsset(patch: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: "glyph",
    title: "glyph",
    createdAt: "2026-06-28T00:00:00.000Z",
    timestamp: 1,
    imageDataUrl: "",
    imageUrl: "",
    image_url: "",
    sampleUrl: "",
    model: "imagetracer",
    prompt: "",
    status: "complete",
    provider: "local-glyph",
    operation: "glyphs",
    payload: {},
    references: [],
    ...patch
  };
}

describe("cleanTraceSvg", () => {
  it("removes nearly transparent tracer background paths", () => {
    const svg = `<svg><path fill="rgb(254,254,254)" opacity="0.00392156862745098" d="M0 0Z" /><path fill="black" opacity="1" d="M1 1Z" /></svg>`;

    expect(cleanTraceSvg(svg)).not.toContain("0.00392156862745098");
    expect(cleanTraceSvg(svg)).toContain('fill="black"');
  });

  it("moves solid light canvas paths behind dark glyph paths", () => {
    const svg = `<svg width="48" height="48"><path fill="black" d="M 10 10 L 38 10 L 38 38 L 10 38 Z" /><path fill="white" d="M 0 0 L 48 0 L 48 48 L 0 48 L 0 0 Z" /></svg>`;
    const cleaned = cleanTraceSvg(svg);

    expect(cleaned.indexOf('fill="white"')).toBeLessThan(cleaned.indexOf('fill="black"'));
  });
});

describe("glyphPreviewBackgroundForSvg", () => {
  it("uses a light background for dark SVG glyphs", () => {
    expect(glyphPreviewBackgroundForSvg('<svg><path fill="black" d="M0 0Z" /></svg>')).toBe("light");
  });

  it("uses a dark background for white SVG glyphs", () => {
    expect(glyphPreviewBackgroundForSvg('<svg><path fill="white" d="M0 0Z" /></svg>')).toBe("dark");
  });

  it("keeps mixed black and white traces on a light background", () => {
    expect(
      glyphPreviewBackgroundForSvg(
        '<svg><path fill="rgb(253,253,253)" opacity="0.003" d="M0 0Z" /><path fill="rgb(0,0,0)" d="M1 1Z" /></svg>'
      )
    ).toBe("light");
  });
});

describe("glyphPreviewBackgroundForAsset", () => {
  it("uses stored preview metadata before parsing SVG content", () => {
    expect(glyphPreviewBackgroundForAsset(glyphAsset({ payload: { previewBackground: "dark" } }))).toBe("dark");
  });

  it("defaults glyph assets without SVG content to a light background", () => {
    expect(glyphPreviewBackgroundForAsset(glyphAsset())).toBe("light");
  });
});
