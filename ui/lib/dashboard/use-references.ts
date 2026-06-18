import { useMemo, useState } from "react";
import { buildReferenceCue, readReferenceFiles } from "@/lib/dashboard-generation";
import { BFL_MAX_REFERENCES } from "@/lib/provider-registry";
import { defaultReferenceCue } from "@/lib/prompt-utils";
import { referenceRoleForIndex } from "@/lib/reference-roles";
import type { AssetRecord, ReferenceImage, ReferenceRole } from "@/lib/types";

type UseReferencesDeps = {
  assets: AssetRecord[];
  setError: (value: string) => void;
};

export function useReferences({ assets, setError }: UseReferencesDeps) {
  const [referenceCue, setReferenceCue] = useState(defaultReferenceCue);
  const [referenceWeight, setReferenceWeight] = useState(80);
  const [references, setReferences] = useState<ReferenceImage[]>([]);

  const effectiveReferenceCue = useMemo(
    () => buildReferenceCue(referenceCue, referenceWeight, references),
    [referenceCue, referenceWeight, references]
  );
  const primaryReference = references[0];
  const primaryReferenceUrl = primaryReference?.value.startsWith("data:") ? "" : primaryReference?.value || "";
  const primaryReferencePreview = primaryReference?.value || "";

  async function addReferenceFiles(files: File[], role?: ReferenceRole) {
    const slots = Math.max(0, BFL_MAX_REFERENCES - references.length);
    if (!slots) return [];
    const selectedFiles = files.slice(0, slots);
    const firstSlot = references.length + 1;
    const loaded = await readReferenceFiles(selectedFiles);
    setReferences((current) =>
      [
        ...current,
        ...loaded.map((reference, index) => ({
          ...reference,
          role: role || referenceRoleForIndex(current.length + index)
        }))
      ].slice(0, BFL_MAX_REFERENCES)
    );
    return loaded.map((_, index) => firstSlot + index);
  }
  async function setPrimaryReferenceFiles(files: File[], role?: ReferenceRole) {
    const [loaded] = await readReferenceFiles(files.slice(0, 1));
    if (!loaded) return null;
    setReferences((current) =>
      [
        {
          ...loaded,
          role: role || current[0]?.role || referenceRoleForIndex(0)
        },
        ...current.slice(1)
      ].slice(0, BFL_MAX_REFERENCES)
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
          role: current[0]?.role || referenceRoleForIndex(0)
        },
        ...rest
      ].slice(0, BFL_MAX_REFERENCES);
    });
  }
  function clearPrimaryReference() {
    setReferences((current) => current.slice(1));
  }

  function referenceValueForAsset(asset: AssetRecord) {
    return asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
  }

  function referenceFromAsset(asset: AssetRecord, index: number, role?: ReferenceRole): ReferenceImage {
    return {
      id: `asset-ref-${asset.id}-${Date.now()}`,
      name: asset.title || asset.id,
      value: referenceValueForAsset(asset),
      role: role || referenceRoleForIndex(index),
      assetId: asset.id
    };
  }

  function setPrimaryAssetReference(asset: AssetRecord, role?: ReferenceRole) {
    setReferences((current) =>
      [
        referenceFromAsset(asset, 0, role || current[0]?.role),
        ...current.slice(1)
      ].slice(0, BFL_MAX_REFERENCES)
    );
    setError("");
    return 1;
  }

  function addAssetReferences(nextAssets: AssetRecord[], role?: ReferenceRole) {
    const next = [...references];
    const slots: number[] = [];

    nextAssets.forEach((asset) => {
      const existingIndex = next.findIndex((reference) => reference.assetId === asset.id);
      if (existingIndex >= 0) {
        if (role) next[existingIndex] = { ...next[existingIndex], role };
        slots.push(existingIndex + 1);
        return;
      }
      if (next.length >= BFL_MAX_REFERENCES) return;
      next.push(referenceFromAsset(asset, next.length, role));
      slots.push(next.length);
    });

    if (!slots.length && nextAssets.length) {
      setError(`Reference slots are full. BFL accepts up to ${BFL_MAX_REFERENCES} reference images.`);
      return [];
    }
    setReferences(next.slice(0, BFL_MAX_REFERENCES));
    setError("");
    return slots;
  }

  function addAssetReference(asset: AssetRecord, role?: ReferenceRole) {
    const [slot] = addAssetReferences([asset], role);
    if (!slot) return null;
    return slot;
  }
  function sendAssetToReference(asset: AssetRecord, role?: ReferenceRole) {
    const slot = addAssetReference(asset, role);
    if (!slot) return null;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return slot;
  }
  function addReferenceFromDragPayload(payload: string, role?: ReferenceRole) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    return asset ? sendAssetToReference(asset, role) : null;
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
