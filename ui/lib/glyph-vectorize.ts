import ImageTracer from "imagetracerjs";
import { clampRectToBounds, placementRect, type Rect } from "@/lib/glyph-geometry";
import { cleanTraceSvg, svgDataUrl } from "@/lib/glyph-svg";

/** Load an image source (data URL or remote URL) into a decoded HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image"));
    image.src = src;
  });
}

/** Crop a region (in natural pixels) out of a decoded image into its own canvas. */
export function cropImageRegion(image: HTMLImageElement, region: Rect): HTMLCanvasElement {
  const rect = clampRectToBounds(region, image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.width);
  canvas.height = Math.max(1, rect.height);
  const context = canvas.getContext("2d");
  if (context) {
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  }
  return canvas;
}

export type TraceSettings = {
  /** palette size — fewer colors = cleaner, more poster-like trace */
  colors: number;
  /** ignore shapes smaller than this many px² (despeckle) */
  minArea: number;
  /** drop a near-uniform background color to transparent before tracing */
  knockoutBackground: boolean;
};

/**
 * Make the dominant corner color transparent so the traced glyph has a clean cutout
 * instead of a filled background plate. Mutates and returns the same canvas.
 */
export function knockoutBackground(canvas: HTMLCanvasElement, tolerance = 28): HTMLCanvasElement {
  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0 || canvas.height === 0) return canvas;
  const data = context.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  const w = canvas.width;
  const h = canvas.height;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of corners) {
    r += px[c];
    g += px[c + 1];
    b += px[c + 2];
  }
  r /= corners.length;
  g /= corners.length;
  b /= corners.length;
  for (let i = 0; i < px.length; i += 4) {
    if (Math.abs(px[i] - r) <= tolerance && Math.abs(px[i + 1] - g) <= tolerance && Math.abs(px[i + 2] - b) <= tolerance) {
      px[i + 3] = 0;
    }
  }
  context.putImageData(data, 0, 0);
  return canvas;
}

/** Trace a cropped raster region to an SVG string using imagetracerjs. */
export function vectorizeCanvas(canvas: HTMLCanvasElement, settings: TraceSettings): string {
  const source = settings.knockoutBackground ? knockoutBackground(canvas) : canvas;
  const context = source.getContext("2d");
  if (!context) return "";
  const imageData = context.getImageData(0, 0, source.width, source.height);
  return cleanTraceSvg(ImageTracer.imagedataToSVG(imageData, {
    numberofcolors: Math.max(2, Math.round(settings.colors)),
    pathomit: Math.max(0, Math.round(settings.minArea)),
    ltres: 1,
    qtres: 1,
    rightangleenhance: 1,
    linefilter: 1,
    scale: 1
  }));
}

/**
 * Draw a traced SVG onto a transparent target canvas, centered with padding (contain),
 * and return a PNG data URL ready to save as an asset.
 */
export async function composeGlyphPng(
  svg: string,
  glyphWidth: number,
  glyphHeight: number,
  target: { width: number; height: number },
  padding = Math.round(Math.min(target.width, target.height) * 0.08)
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const dest = placementRect(glyphWidth, glyphHeight, target.width, target.height, padding);
  const image = await loadImage(svgDataUrl(svg));
  context.drawImage(image, dest.x, dest.y, dest.width, dest.height);
  return canvas.toDataURL("image/png");
}

/** Trigger a browser download of an SVG string. */
export function downloadSvg(svg: string, filename: string) {
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
