import type { AssetRecord } from "@/lib/types";

export type GlyphPreviewBackground = "light" | "dark";

type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const TRANSPARENT_OPACITY_THRESHOLD = 0.02;
const LIGHT_LUMINANCE_THRESHOLD = 0.72;
const CANVAS_BOUND_EPSILON = 1.5;

const NAMED_COLORS: Record<string, Rgba> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 }
};

function attrValue(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]+)"`, "i"));
  return match ? match[1] : null;
}

function styleValue(tag: string, name: string) {
  const style = attrValue(tag, "style");
  if (!style) return null;
  const match = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"));
  return match ? match[1].trim() : null;
}

function parseOpacity(value: string | null, fallback = 1) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function parseColor(value: string | null): Rgba | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "none" || normalized === "transparent" || normalized.startsWith("url(")) {
    return null;
  }
  if (NAMED_COLORS[normalized]) return NAMED_COLORS[normalized];

  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split("").map((char) => `${char}${char}`).join("") : raw;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1
    };
  }

  const rgb = normalized.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgb) return null;
  const parts = rgb[1].split(",").map((part) => part.trim());
  if (parts.length < 3) return null;
  const [r, g, b] = parts.slice(0, 3).map((part) => Number(part.replace("%", "")));
  if (![r, g, b].every(Number.isFinite)) return null;
  const usesPercent = parts.slice(0, 3).some((part) => part.endsWith("%"));
  return {
    r: usesPercent ? Math.round((r / 100) * 255) : r,
    g: usesPercent ? Math.round((g / 100) * 255) : g,
    b: usesPercent ? Math.round((b / 100) * 255) : b,
    a: parseOpacity(parts[3] || null)
  };
}

function luminance(color: Rgba) {
  const [r, g, b] = [color.r, color.g, color.b].map((value) => {
    const channel = Math.max(0, Math.min(255, value)) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function tagPaintColors(tag: string) {
  const opacity = parseOpacity(attrValue(tag, "opacity"));
  const fillOpacity = opacity * parseOpacity(attrValue(tag, "fill-opacity"));
  const strokeOpacity = opacity * parseOpacity(attrValue(tag, "stroke-opacity"));
  const colors: Rgba[] = [];
  const fill = parseColor(attrValue(tag, "fill") || styleValue(tag, "fill"));
  const stroke = parseColor(attrValue(tag, "stroke") || styleValue(tag, "stroke"));

  if (fill && fill.a * fillOpacity > TRANSPARENT_OPACITY_THRESHOLD) {
    colors.push({ ...fill, a: fill.a * fillOpacity });
  }
  if (stroke && stroke.a * strokeOpacity > TRANSPARENT_OPACITY_THRESHOLD) {
    colors.push({ ...stroke, a: stroke.a * strokeOpacity });
  }

  return colors;
}

function svgSize(svg: string) {
  const svgTag = svg.match(/<svg\b[^>]*>/i)?.[0] || "";
  const width = Number(attrValue(svgTag, "width"));
  const height = Number(attrValue(svgTag, "height"));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
}

function pathData(tag: string) {
  return attrValue(tag, "d") || "";
}

function numericPathValues(data: string) {
  return (data.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
}

function pathCoversCanvas(tag: string, size: { width: number; height: number }) {
  const values = numericPathValues(pathData(tag));
  if (values.length < 8) return false;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    xs.push(values[index]);
    ys.push(values[index + 1]);
  }
  return (
    Math.min(...xs) <= CANVAS_BOUND_EPSILON &&
    Math.min(...ys) <= CANVAS_BOUND_EPSILON &&
    Math.max(...xs) >= size.width - CANVAS_BOUND_EPSILON &&
    Math.max(...ys) >= size.height - CANVAS_BOUND_EPSILON
  );
}

function isLightPaintPath(tag: string) {
  const colors = tagPaintColors(tag);
  return colors.length > 0 && colors.every((color) => luminance(color) >= LIGHT_LUMINANCE_THRESHOLD);
}

function moveLightCanvasPathsBehind(svg: string) {
  const size = svgSize(svg);
  if (!size) return svg;
  const pathMatches = Array.from(svg.matchAll(/<path\b[^>]*(?:\/>|>[\s\S]*?<\/path>)/gi));
  if (pathMatches.length < 2) return svg;
  const hasDarkPath = pathMatches.some(([tag]) => tagPaintColors(tag).some((color) => luminance(color) < LIGHT_LUMINANCE_THRESHOLD));
  if (!hasDarkPath) return svg;

  const backgroundPaths: string[] = [];
  let rebuilt = "";
  let cursor = 0;
  pathMatches.forEach((match) => {
    const tag = match[0];
    const index = match.index || 0;
    rebuilt += svg.slice(cursor, index);
    if (isLightPaintPath(tag) && pathCoversCanvas(tag, size)) {
      backgroundPaths.push(tag);
    } else {
      rebuilt += tag;
    }
    cursor = index + tag.length;
  });
  rebuilt += svg.slice(cursor);
  if (!backgroundPaths.length) return svg;
  return rebuilt.replace(/(<svg\b[^>]*>)/i, `$1${backgroundPaths.join("")}`);
}

export function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function cleanTraceSvg(svg: string) {
  const withoutTransparentPaths = svg.replace(/<path\b[^>]*\bopacity="([^"]+)"[^>]*(?:\/>|>[\s\S]*?<\/path>)/gi, (tag, opacity) => {
    const parsed = Number(opacity);
    return Number.isFinite(parsed) && parsed <= TRANSPARENT_OPACITY_THRESHOLD ? "" : tag;
  });
  return moveLightCanvasPathsBehind(withoutTransparentPaths);
}

export function glyphPreviewBackgroundForSvg(svg: string): GlyphPreviewBackground {
  const colors = Array.from(svg.matchAll(/<[^!?/][^>]*>/g)).flatMap(([tag]) => tagPaintColors(tag));
  if (!colors.length) return "light";
  const hasDarkPaint = colors.some((color) => luminance(color) < LIGHT_LUMINANCE_THRESHOLD);
  return hasDarkPaint ? "light" : "dark";
}

export function glyphSvgFromAsset(asset: AssetRecord | null) {
  const svg = asset?.payload?.svg;
  return typeof svg === "string" && svg.trim() ? svg : null;
}

export function isGlyphAsset(asset: AssetRecord | null) {
  return Boolean(
    asset &&
      (asset.operation === "glyphs" ||
        asset.provider === "local-glyph" ||
        asset.localSvgPath ||
        glyphSvgFromAsset(asset))
  );
}

export function glyphPreviewBackgroundForAsset(asset: AssetRecord | null): GlyphPreviewBackground | null {
  if (!isGlyphAsset(asset)) return null;
  const stored = asset?.payload?.previewBackground || asset?.runSettings?.previewBackground;
  if (stored === "light" || stored === "dark") return stored;
  const svg = glyphSvgFromAsset(asset);
  return svg ? glyphPreviewBackgroundForSvg(svg) : "light";
}

export function glyphPreviewClassName(background: GlyphPreviewBackground | null) {
  if (!background) return "";
  return background === "dark" ? "glyphPreviewOnDark" : "glyphPreviewOnLight";
}
