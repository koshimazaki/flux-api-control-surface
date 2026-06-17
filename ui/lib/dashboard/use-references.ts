import { useMemo, useState } from "react";
import { buildReferenceCue, readReferenceFiles } from "@/lib/dashboard-generation";
import { BFL_MAX_REFERENCES } from "@/lib/provider-registry";
import { defaultReferenceCue } from "@/lib/prompt-utils";
import type { AssetRecord, ReferenceImage } from "@/lib/types";

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

  async function addReferenceFiles(files: File[]) {
    const slots = Math.max(0, BFL_MAX_REFERENCES - references.length);
    if (!slots) return [];
    const selectedFiles = files.slice(0, slots);
    const firstSlot = references.length + 1;
    const loaded = await readReferenceFiles(selectedFiles);
    setReferences((current) => [...current, ...loaded].slice(0, BFL_MAX_REFERENCES));
    return loaded.map((_, index) => firstSlot + index);
  }
  async function setPrimaryReferenceFiles(files: File[]) {
    const [loaded] = await readReferenceFiles(files.slice(0, 1));
    if (!loaded) return null;
    setReferences((current) => [loaded, ...current.slice(1)].slice(0, BFL_MAX_REFERENCES));
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
          value: trimmed
        },
        ...rest
      ].slice(0, BFL_MAX_REFERENCES);
    });
  }
  function clearPrimaryReference() {
    setReferences((current) => current.slice(1));
  }
  function addAssetReference(asset: AssetRecord) {
    const existingIndex = references.findIndex((reference) => reference.assetId === asset.id);
    if (existingIndex >= 0) {
      setError("");
      return existingIndex + 1;
    }
    if (references.length >= BFL_MAX_REFERENCES) {
      setError(`Reference slots are full. BFL accepts up to ${BFL_MAX_REFERENCES} reference images.`);
      return null;
    }
    const slot = references.length + 1;
    setReferences((current) => {
      if (current.some((reference) => reference.assetId === asset.id)) return current;
      return [
        ...current,
        {
          id: `asset-ref-${asset.id}-${Date.now()}`,
          name: asset.title || asset.id,
          value: asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url,
          assetId: asset.id
        }
      ].slice(0, BFL_MAX_REFERENCES);
    });
    setError("");
    return slot;
  }
  function sendAssetToReference(asset: AssetRecord) {
    const slot = addAssetReference(asset);
    if (!slot) return null;
    window.scrollTo({ top: 0, behavior: "smooth" });
    return slot;
  }
  function addReferenceFromDragPayload(payload: string) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    return asset ? sendAssetToReference(asset) : null;
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
    sendAssetToReference,
    addReferenceFromDragPayload
  };
}
