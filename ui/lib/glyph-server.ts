import ImageTracer from "imagetracerjs";
import sharp from "sharp";
import { clampRectToBounds, placementRect, targetSizeFor, type Rect } from "@/lib/glyph-geometry";
import { cleanTraceSvg } from "@/lib/glyph-svg";

export type ServerGlyphSettings = {
  colors?: number;
  minArea?: number;
  knockoutBackground?: boolean;
  targetMode?: "square" | "native";
  selection?: Rect | null;
  maxTraceSize?: number;
};

export type ServerGlyphResult = {
  svg: string;
  pngBuffer: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  selection: Rect;
  cropWidth: number;
  cropHeight: number;
  outputWidth: number;
  outputHeight: number;
  colors: number;
  minArea: number;
  knockoutBackground: boolean;
  targetMode: "square" | "native";
  maxTraceSize: number;
};

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeSelection(selection: Rect | null | undefined, width: number, height: number): Rect {
  const fallback = { x: 0, y: 0, width, height };
  if (!selection) return fallback;
  const rect = clampRectToBounds(
    {
      x: clampInt(selection.x, 0, 0, width),
      y: clampInt(selection.y, 0, 0, height),
      width: clampInt(selection.width, width, 1, width),
      height: clampInt(selection.height, height, 1, height)
    },
    width,
    height
  );
  return rect.width > 0 && rect.height > 0 ? rect : fallback;
}

function knockoutRawBackground(data: Buffer, width: number, height: number, tolerance = 28) {
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + (width - 1)) * 4];
  const color = corners.reduce(
    (sum, offset) => ({
      r: sum.r + data[offset],
      g: sum.g + data[offset + 1],
      b: sum.b + data[offset + 2]
    }),
    { r: 0, g: 0, b: 0 }
  );
  const r = color.r / corners.length;
  const g = color.g / corners.length;
  const b = color.b / corners.length;

  for (let index = 0; index < data.length; index += 4) {
    if (
      Math.abs(data[index] - r) <= tolerance &&
      Math.abs(data[index + 1] - g) <= tolerance &&
      Math.abs(data[index + 2] - b) <= tolerance
    ) {
      data[index + 3] = 0;
    }
  }
}

function traceRawImage(data: Buffer, width: number, height: number, colors: number, minArea: number) {
  const imageData = {
    width,
    height,
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
  } as ImageData;

  return cleanTraceSvg(ImageTracer.imagedataToSVG(imageData, {
    numberofcolors: colors,
    pathomit: minArea,
    ltres: 1,
    qtres: 1,
    rightangleenhance: 1,
    linefilter: 1,
    scale: 1
  }));
}

async function composeGlyphPngBuffer(
  svg: string,
  glyphWidth: number,
  glyphHeight: number,
  target: { width: number; height: number }
) {
  const padding = Math.round(Math.min(target.width, target.height) * 0.08);
  const dest = placementRect(glyphWidth, glyphHeight, target.width, target.height, padding);
  const rendered = await sharp(Buffer.from(svg))
    .resize({
      width: Math.max(1, Math.round(dest.width)),
      height: Math.max(1, Math.round(dest.height)),
      fit: "fill"
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: target.width,
      height: target.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: rendered, left: Math.round(dest.x), top: Math.round(dest.y) }])
    .png()
    .toBuffer();
}

export async function vectorizeGlyphImage(input: Buffer, settings: ServerGlyphSettings = {}): Promise<ServerGlyphResult> {
  const colors = clampInt(settings.colors, 4, 2, 32);
  const minArea = clampInt(settings.minArea, 8, 0, 80);
  const targetMode = settings.targetMode === "native" ? "native" : "square";
  const maxTraceSize = clampInt(settings.maxTraceSize, 512, 128, 1536);
  const knockoutBackground = settings.knockoutBackground !== false;
  const image = sharp(input, { limitInputPixels: false }).rotate().ensureAlpha();
  const metadata = await image.metadata();
  const sourceWidth = metadata.width || 0;
  const sourceHeight = metadata.height || 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Could not read image dimensions.");
  }

  const selection = normalizeSelection(settings.selection, sourceWidth, sourceHeight);
  const { data, info } = await image
    .clone()
    .extract({
      left: selection.x,
      top: selection.y,
      width: selection.width,
      height: selection.height
    })
    .resize({
      width: maxTraceSize,
      height: maxTraceSize,
      fit: "inside",
      withoutEnlargement: true
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = Buffer.from(data);
  if (knockoutBackground) knockoutRawBackground(raw, info.width, info.height);
  const svg = traceRawImage(raw, info.width, info.height, colors, minArea);
  if (!svg.trim()) throw new Error("Vector trace produced an empty SVG.");

  const target = targetSizeFor(targetMode, selection);
  const pngBuffer = await composeGlyphPngBuffer(svg, info.width, info.height, target);

  return {
    svg,
    pngBuffer,
    sourceWidth,
    sourceHeight,
    selection,
    cropWidth: info.width,
    cropHeight: info.height,
    outputWidth: target.width,
    outputHeight: target.height,
    colors,
    minArea,
    knockoutBackground,
    targetMode,
    maxTraceSize
  };
}
