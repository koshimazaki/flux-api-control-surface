"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultGlyphLabCache,
  emptyGlyphLabDraft,
  normalizeGlyphLabCache,
  type GlyphLabCache,
  type GlyphLabDraft,
  type GlyphLabSettings
} from "@/lib/glyph-lab-state";

const GLYPH_LAB_CACHE_KEY = "bfl-glyph-lab-cache";
const MAX_DRAFTS = 30;

function loadGlyphLabCache() {
  if (typeof window === "undefined") return defaultGlyphLabCache;
  try {
    return normalizeGlyphLabCache(JSON.parse(localStorage.getItem(GLYPH_LAB_CACHE_KEY) || "null"));
  } catch {
    return defaultGlyphLabCache;
  }
}

function trimDrafts(drafts: GlyphLabCache["drafts"]) {
  return Object.fromEntries(Object.entries(drafts).slice(-MAX_DRAFTS));
}

export function useGlyphLabCache(activeAssetId?: string) {
  const [cache, setCache] = useState<GlyphLabCache>(loadGlyphLabCache);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        GLYPH_LAB_CACHE_KEY,
        JSON.stringify({ ...cache, drafts: trimDrafts(cache.drafts) })
      );
    }, 150);
    return () => window.clearTimeout(timer);
  }, [cache]);

  const activeGlyphDraft = useMemo(
    () => (activeAssetId ? cache.drafts[activeAssetId] || emptyGlyphLabDraft : emptyGlyphLabDraft),
    [activeAssetId, cache.drafts]
  );

  const updateGlyphSettings = useCallback((patch: Partial<GlyphLabSettings>) => {
    setCache((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, []);

  const updateActiveGlyphDraft = useCallback(
    (patch: Partial<GlyphLabDraft>) => {
      if (!activeAssetId) return;
      setCache((current) => ({
        ...current,
        drafts: {
          ...current.drafts,
          [activeAssetId]: {
            ...emptyGlyphLabDraft,
            ...current.drafts[activeAssetId],
            ...patch
          }
        }
      }));
    },
    [activeAssetId]
  );

  return {
    glyphSettings: cache.settings,
    activeGlyphDraft,
    updateGlyphSettings,
    updateActiveGlyphDraft
  };
}
