import type { WorkspaceMode } from "@/lib/types";

export const TOOL_WORKSPACE_CACHE_KEY = "bfl-tool-workspace-cache";

export type ToolWorkspaceCache = {
  workspaceMode: WorkspaceMode;
  sharedSourceAssetId: string | null;
  vtoSourceAssetId: string | null;
  glyphSourceAssetId: string | null;
  vtoGarmentAssetIds: (string | null)[];
  vtoPromptText: string;
  outpaintPromptText: string;
  outpaintOffsetX: string;
  outpaintOffsetY: string;
  outpaintMode: "high" | "fast";
  outpaintAutoCrop: boolean;
};

export const defaultToolWorkspaceCache: ToolWorkspaceCache = {
  workspaceMode: "prompt",
  sharedSourceAssetId: null,
  vtoSourceAssetId: null,
  glyphSourceAssetId: null,
  vtoGarmentAssetIds: [null, null, null, null],
  vtoPromptText: "",
  outpaintPromptText: "",
  outpaintOffsetX: "",
  outpaintOffsetY: "",
  outpaintMode: "high",
  outpaintAutoCrop: false
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "prompt" || value === "erase" || value === "vto" || value === "outpaint" || value === "deblur" || value === "glyphs";
}

function normalizeGarmentIds(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return Array.from({ length: 4 }, (_, index) => asNullableString(items[index]));
}

export function normalizeToolWorkspaceCache(value: unknown): ToolWorkspaceCache {
  const record = asRecord(value);
  return {
    workspaceMode: isWorkspaceMode(record.workspaceMode) ? record.workspaceMode : defaultToolWorkspaceCache.workspaceMode,
    sharedSourceAssetId: asNullableString(record.sharedSourceAssetId),
    vtoSourceAssetId: asNullableString(record.vtoSourceAssetId),
    glyphSourceAssetId: asNullableString(record.glyphSourceAssetId),
    vtoGarmentAssetIds: normalizeGarmentIds(record.vtoGarmentAssetIds),
    vtoPromptText: asString(record.vtoPromptText),
    outpaintPromptText: asString(record.outpaintPromptText),
    outpaintOffsetX: asString(record.outpaintOffsetX),
    outpaintOffsetY: asString(record.outpaintOffsetY),
    outpaintMode: record.outpaintMode === "fast" ? "fast" : "high",
    outpaintAutoCrop: typeof record.outpaintAutoCrop === "boolean" ? record.outpaintAutoCrop : false
  };
}

export function loadToolWorkspaceCache() {
  if (typeof window === "undefined") return defaultToolWorkspaceCache;
  try {
    return normalizeToolWorkspaceCache(JSON.parse(localStorage.getItem(TOOL_WORKSPACE_CACHE_KEY) || "null"));
  } catch {
    return defaultToolWorkspaceCache;
  }
}

export function persistToolWorkspaceCache(cache: ToolWorkspaceCache) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TOOL_WORKSPACE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* cache is non-critical */
  }
}
