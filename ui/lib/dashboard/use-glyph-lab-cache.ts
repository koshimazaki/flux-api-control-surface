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
const MAX_CACHE_CHARS = 3_500_000; // stay under the ~5MB localStorage quota (conservative)

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

// localStorage throws QuotaExceededError once the serialized cache exceeds the
// per-origin budget, and a few large vectorised SVG drafts is enough. Cap by
// count, then drop the oldest drafts until the payload fits, and never let
// setItem throw, so the Glyph Lab degrades gracefully instead of crashing.
function persistGlyphLabCache(cache: GlyphLabCache) {
  if (typeof window === "undefined") return;
  let entries = Object.entries(trimDrafts(cache.drafts));
  while (true) {
    const payload = JSON.stringify({ ...cache, drafts: Object.fromEntries(entries) });
    if (payload.length <= MAX_CACHE_CHARS || entries.length === 0) {
      try {
        localStorage.setItem(GLYPH_LAB_CACHE_KEY, payload);
      } catch {
        try {
          localStorage.setItem(GLYPH_LAB_CACHE_KEY, JSON.stringify({ ...cache, drafts: {} }));
        } catch {
          /* out of quota even when empty: keep the in-memory cache for this session */
        }
      }
      return;
    }
    entries = entries.slice(1);
  }
}

export function useGlyphLabCache(activeAssetId?: string) {
  const [cache, setCache] = useState<GlyphLabCache>(loadGlyphLabCache);

  useEffect(() => {
    const timer = window.setTimeout(() => persistGlyphLabCache(cache), 150);
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
