import { useEffect, useState } from "react";
import { FLUX3_IMAGE_DRAFT_KEY, FLUX3_IMAGE_DRAFT_EVENT, defaultFlux3ImageDraft, normalizeFlux3ImageDraft, type Flux3ImageDraft } from "@/lib/flux3-image-draft";
export { FLUX3_IMAGE_DRAFT_KEY, FLUX3_IMAGE_DRAFT_EVENT, defaultFlux3ImageDraft, normalizeFlux3ImageDraft, type Flux3ImageDraft } from "@/lib/flux3-image-draft";

function readStoredDraft() {
  return normalizeFlux3ImageDraft(JSON.parse(localStorage.getItem(FLUX3_IMAGE_DRAFT_KEY) || "null"));
}

/**
 * Changes the stored draft from outside the workspace, such as a gallery
 * button, and tells an open workspace to pick it up. Returns null when
 * browser storage is unavailable.
 */
export function updateStoredFlux3ImageDraft<T extends { draft: Flux3ImageDraft }>(change: (draft: Flux3ImageDraft) => T): T | null {
  try {
    const result = change(readStoredDraft());
    localStorage.setItem(FLUX3_IMAGE_DRAFT_KEY, JSON.stringify(result.draft));
    window.dispatchEvent(new Event(FLUX3_IMAGE_DRAFT_EVENT));
    return result;
  } catch {
    return null;
  }
}

/** FLUX 3 Image workspace state, kept in local storage so it survives tab switches. */
export function useFlux3ImageDraft(sourceId: string | null) {
  const [draft, setDraft] = useState<Flux3ImageDraft>(defaultFlux3ImageDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      try {
        setDraft(readStoredDraft());
      } catch {
        /* keep the current draft */
      }
    };
    load();
    setHydrated(true);
    // The gallery can add references while the workspace is open.
    window.addEventListener(FLUX3_IMAGE_DRAFT_EVENT, load);
    return () => window.removeEventListener(FLUX3_IMAGE_DRAFT_EVENT, load);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(FLUX3_IMAGE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* the draft cache is non-critical */
    }
  }, [draft, hydrated]);

  // A different source image invalidates boxes drawn in the old one's
  // pixels. No source (still loading after a reload, or cleared) keeps them.
  useEffect(() => {
    if (!hydrated || !sourceId) return;
    setDraft((current) =>
      current.regionSourceId === sourceId ? current : { ...current, regions: [], regionSourceId: sourceId, regionFrame: null }
    );
  }, [hydrated, sourceId]);

  function update(patch: Partial<Flux3ImageDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return { draft, update, setDraft };
}
