import { useEffect, useMemo, useState } from "react";
import { buildReferenceCue, readReferenceFiles } from "@/lib/dashboard-generation";
import { defaultReferenceCue } from "@/lib/prompt-utils";
import { referenceRoleForIndex } from "@/lib/reference-roles";
import type { AssetRecord, ReferenceImage, ReferenceRole } from "@/lib/types";

const REFERENCES_STORAGE_KEY = "bfl-references";

// Persist the working reference set as lightweight descriptors. Heavy inline data
// URLs are swapped for a durable, resolvable outputs URL (never an empty string)
// so a restored reference still renders, passes `Boolean(value)` filters, and
// submits — the generate route resolves /api/outputs/:id/image back to image data.
// Already-light values and uploads without a backing asset are kept as-is.
function stripReferenceForStorage(reference: ReferenceImage): ReferenceImage {
  if (reference.assetId && reference.value.startsWith("data:")) {
    return { ...reference, value: `/api/outputs/${encodeURIComponent(reference.assetId)}/image` };
  }
  return reference;
}

type UseReferencesDeps = {
  assets: AssetRecord[];
  maxReferences: number;
  modelLabel: string;
  setError: (value: string) => void;
};

export function useReferences({ assets, maxReferences, modelLabel, setError }: UseReferencesDeps) {
  const [referenceCue, setReferenceCue] = useState(defaultReferenceCue);
  const [referenceWeight, setReferenceWeight] = useState(80);
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [hasHydratedReferences, setHasHydratedReferences] = useState(false);
  const referenceLimit = Math.max(0, Math.floor(maxReferences));

  // Restore the working reference set once on mount so role assignments survive a refresh.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(REFERENCES_STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed)) setReferences(parsed.slice(0, referenceLimit));
    } catch {
      localStorage.removeItem(REFERENCES_STORAGE_KEY);
    }
    setHasHydratedReferences(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Upgrade asset-backed references to the asset's live source once the gallery
  // has loaded — replaces a stored outputs URL with the real image (covers
  // IndexedDB-only imports that the URL can't resolve, and renders inline).
  useEffect(() => {
    if (!assets.length) return;
    setReferences((current) => {
      let changed = false;
      const next = current.map((reference) => {
        if (!reference.assetId) return reference;
        const asset = assets.find((item) => item.id === reference.assetId);
        if (!asset) return reference;
        const value = asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url || "";
        if (!value || value === reference.value) return reference;
        changed = true;
        return { ...reference, value };
      });
      return changed ? next : current;
    });
  }, [assets]);

  // Persist after hydration so the initial empty state never clobbers saved references.
  useEffect(() => {
    if (!hasHydratedReferences) return;
    try {
      localStorage.setItem(REFERENCES_STORAGE_KEY, JSON.stringify(references.map(stripReferenceForStorage)));
    } catch {
      // ignore quota / serialization failures
    }
  }, [references, hasHydratedReferences]);

  const effectiveReferenceCue = useMemo(
    () => buildReferenceCue(referenceCue, referenceWeight, references),
    [referenceCue, referenceWeight, references]
  );
  const primaryReference = references[0];
  const primaryReferenceUrl = primaryReference?.value.startsWith("data:") ? "" : primaryReference?.value || "";
  const primaryReferencePreview = primaryReference?.value || "";

  async function addReferenceFiles(files: File[], role?: ReferenceRole, targetId?: string) {
    const slots = Math.max(0, referenceLimit - references.length);
    if (!slots) {
      if (files.length) {
        setError(`${modelLabel} accepts up to ${referenceLimit} reference image${referenceLimit === 1 ? "" : "s"}.`);
      }
      return [];
    }
    const selectedFiles = files.slice(0, slots);
    const firstSlot = references.length + 1;
    const loaded = await readReferenceFiles(selectedFiles);
    setReferences((current) =>
      [
        ...current,
        ...loaded.map((reference, index) => ({
          ...reference,
          role: role || referenceRoleForIndex(current.length + index),
          targetId
        }))
      ].slice(0, referenceLimit)
    );
    return loaded.map((_, index) => firstSlot + index);
  }
  async function setPrimaryReferenceFiles(files: File[], role?: ReferenceRole, targetId?: string) {
    const [loaded] = await readReferenceFiles(files.slice(0, 1));
    if (!loaded) return null;
    setReferences((current) =>
      [
        {
          ...loaded,
          role: role || current[0]?.role || referenceRoleForIndex(0),
          targetId: targetId || current[0]?.targetId
        },
        ...current.slice(1)
      ].slice(0, referenceLimit)
    );
    return 1;
  }
  function setPrimaryReferenceUrl(value: string) {
    setReferences((current) => {
      const rest = current.slice(1);
      const trimmed = value.trim();
      if (!trimmed) return rest;
      return [
        {
          id: current[0]?.id || `url-${Date.now()}`,
          name: current[0]?.name || "Reference 1",
          value: trimmed,
          role: current[0]?.role || referenceRoleForIndex(0),
          targetId: current[0]?.targetId
        },
        ...rest
      ].slice(0, referenceLimit);
    });
  }
  function clearPrimaryReference() {
    setReferences((current) => current.slice(1));
  }

  function referenceValueForAsset(asset: AssetRecord) {
    return asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
  }

  function referenceFromAsset(asset: AssetRecord, index: number, role?: ReferenceRole, targetId?: string): ReferenceImage {
    return {
      id: `asset-ref-${asset.id}-${Date.now()}`,
      name: asset.title || asset.id,
      value: referenceValueForAsset(asset),
      role: role || referenceRoleForIndex(index),
      targetId,
      assetId: asset.id
    };
  }

  function setPrimaryAssetReference(asset: AssetRecord, role?: ReferenceRole, targetId?: string) {
    setReferences((current) =>
      [
        referenceFromAsset(asset, 0, role || current[0]?.role, targetId || current[0]?.targetId),
        ...current.slice(1)
      ].slice(0, referenceLimit)
    );
    setError("");
    return 1;
  }

  function addAssetReferences(nextAssets: AssetRecord[], role?: ReferenceRole, targetId?: string) {
    const next = [...references];
    const slots: number[] = [];

    nextAssets.forEach((asset) => {
      const existingIndex = next.findIndex((reference) => reference.assetId === asset.id);
      if (existingIndex >= 0) {
        if (role || targetId) {
          next[existingIndex] = {
            ...next[existingIndex],
            role: role || next[existingIndex].role,
            targetId: targetId || next[existingIndex].targetId
          };
        }
        slots.push(existingIndex + 1);
        return;
      }
      if (next.length >= referenceLimit) return;
      next.push(referenceFromAsset(asset, next.length, role, targetId));
      slots.push(next.length);
    });

    if (!slots.length && nextAssets.length) {
      setError(`${modelLabel} accepts up to ${referenceLimit} reference image${referenceLimit === 1 ? "" : "s"}.`);
      return [];
    }
    setReferences(next.slice(0, referenceLimit));
    setError("");
    return slots;
  }

  function addAssetReference(asset: AssetRecord, role?: ReferenceRole, targetId?: string) {
    const [slot] = addAssetReferences([asset], role, targetId);
    if (!slot) return null;
    return slot;
  }
  function sendAssetToReference(asset: AssetRecord, role?: ReferenceRole, targetId?: string) {
    const slot = addAssetReference(asset, role, targetId);
    if (!slot) return null;
    return slot;
  }
  function addReferenceFromDragPayload(payload: string, role?: ReferenceRole, targetId?: string) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    return asset ? sendAssetToReference(asset, role, targetId) : null;
  }

  return {
    references,
    setReferences,
    referenceCue,
    setReferenceCue,
    referenceWeight,
    setReferenceWeight,
    effectiveReferenceCue,
    primaryReferenceUrl,
    primaryReferencePreview,
    addReferenceFiles,
    setPrimaryReferenceFiles,
    setPrimaryReferenceUrl,
    clearPrimaryReference,
    addAssetReference,
    addAssetReferences,
    setPrimaryAssetReference,
    sendAssetToReference,
    addReferenceFromDragPayload
  };
}
