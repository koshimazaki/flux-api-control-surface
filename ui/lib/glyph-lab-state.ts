import type { Rect } from "@/lib/glyph-geometry";

export type GlyphTargetMode = "square" | "native";

export type GlyphLabSettings = {
  colors: number;
  minArea: number;
  knockout: boolean;
  targetMode: GlyphTargetMode;
};

export type GlyphLabResult = {
  svg: string;
  width: number;
  height: number;
};

export type GlyphLabDraft = {
  selection: Rect | null;
  result: GlyphLabResult | null;
};

export type GlyphLabCache = {
  settings: GlyphLabSettings;
  drafts: Record<string, GlyphLabDraft>;
};

export const defaultGlyphLabSettings: GlyphLabSettings = {
  colors: 8,
  minArea: 8,
  knockout: true,
  targetMode: "square"
};

export const emptyGlyphLabDraft: GlyphLabDraft = {
  selection: null,
  result: null
};

export const defaultGlyphLabCache: GlyphLabCache = {
  settings: defaultGlyphLabSettings,
  drafts: {}
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function isTargetMode(value: unknown): value is GlyphTargetMode {
  return value === "square" || value === "native";
}

function normalizeRect(value: unknown): Rect | null {
  const rect = asRecord(value);
  const x = asNumber(rect.x, NaN);
  const y = asNumber(rect.y, NaN);
  const width = asNumber(rect.width, NaN);
  const height = asNumber(rect.height, NaN);
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}

function normalizeResult(value: unknown): GlyphLabResult | null {
  const result = asRecord(value);
  const svg = typeof result.svg === "string" ? result.svg : "";
  const width = asNumber(result.width, NaN);
  const height = asNumber(result.height, NaN);
  return svg && Number.isFinite(width) && Number.isFinite(height) ? { svg, width, height } : null;
}

export function normalizeGlyphLabCache(value: unknown): GlyphLabCache {
  const record = asRecord(value);
  const settings = asRecord(record.settings);
  const drafts = asRecord(record.drafts);

  return {
    settings: {
      colors: Math.max(2, Math.min(32, Math.round(asNumber(settings.colors, defaultGlyphLabSettings.colors)))),
      minArea: Math.max(0, Math.min(40, Math.round(asNumber(settings.minArea, defaultGlyphLabSettings.minArea)))),
      knockout: asBoolean(settings.knockout, defaultGlyphLabSettings.knockout),
      targetMode: isTargetMode(settings.targetMode) ? settings.targetMode : defaultGlyphLabSettings.targetMode
    },
    drafts: Object.fromEntries(
      Object.entries(drafts).map(([assetId, draft]) => {
        const source = asRecord(draft);
        return [
          assetId,
          {
            selection: normalizeRect(source.selection),
            result: normalizeResult(source.result)
          }
        ];
      })
    )
  };
}
