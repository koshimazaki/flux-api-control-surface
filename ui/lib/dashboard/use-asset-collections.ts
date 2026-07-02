import { useEffect, useMemo, useState } from "react";
import {
  ASSET_COLLECTIONS_CACHE_KEY,
  collectionMembersFromAssets,
  normalizeAssetCollections,
  upsertAssetCollection
} from "@/lib/asset-collections";
import { downloadAssetCollectionZip } from "@/lib/asset-collection-export";
import type {
  AssetCollection,
  AssetCollectionFilter,
  AssetCollectionMember,
  AssetCollectionMemberKind,
  AssetRecord
} from "@/lib/types";

type ImportedImageAssetFiles = (
  files: File[],
  options?: { assetKind?: "output" | "input" | "reference" | "asset"; focusAssetsTab?: boolean; preservePngMetadata?: boolean }
) => Promise<AssetRecord[]>;

type UseAssetCollectionsDeps = {
  assets: AssetRecord[];
  selectedAssetIds: string[];
  setSelectedAssetIds: (update: string[] | ((current: string[]) => string[])) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
  importImageAssetFiles: ImportedImageAssetFiles;
};

type CollectionRouteResponse = {
  collection?: AssetCollection;
  collections?: AssetCollection[];
  error?: string;
};

function safeCache(collections: AssetCollection[]) {
  try {
    localStorage.setItem(ASSET_COLLECTIONS_CACHE_KEY, JSON.stringify(collections));
  } catch (error) {
    console.warn("Could not cache asset collections", error);
  }
}

async function readCollectionResponse(response: Response): Promise<CollectionRouteResponse> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || `Collection request failed with ${response.status}`);
  return data;
}

export function useAssetCollections(deps: UseAssetCollectionsDeps) {
  const { assets, selectedAssetIds, setSelectedAssetIds, setError, setRecoveryMessage, importImageAssetFiles } = deps;
  const [collections, setCollections] = useState<AssetCollection[]>([]);
  const [collectionFilter, setCollectionFilter] = useState<AssetCollectionFilter>("all");
  const [openedCollectionId, setOpenedCollectionId] = useState<string | null>(null);

  const openedCollection = useMemo(
    () => collections.find((collection) => collection.id === openedCollectionId) || null,
    [collections, openedCollectionId]
  );

  useEffect(() => {
    try {
      const cached = localStorage.getItem(ASSET_COLLECTIONS_CACHE_KEY);
      if (cached) setCollections(normalizeAssetCollections(JSON.parse(cached)));
    } catch {
      localStorage.removeItem(ASSET_COLLECTIONS_CACHE_KEY);
    }
    fetch("/api/collections", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Collection load failed with ${response.status}`);
        return normalizeAssetCollections(await response.json());
      })
      .then((serverCollections) => {
        setCollections(serverCollections);
        safeCache(serverCollections);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    safeCache(collections);
  }, [collections]);

  useEffect(() => {
    if (!openedCollectionId) return;
    if (!collections.some((collection) => collection.id === openedCollectionId)) setOpenedCollectionId(null);
  }, [collections, openedCollectionId]);

  function membersForAssetIds(assetIds: string[], kind?: AssetCollectionMemberKind): AssetCollectionMember[] {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const resolvedAssets = Array.from(new Set(assetIds))
      .map((assetId) => byId.get(assetId))
      .filter((asset): asset is AssetRecord => Boolean(asset));
    return collectionMembersFromAssets(resolvedAssets, kind);
  }

  function applyCollections(nextCollections: AssetCollection[], collection?: AssetCollection) {
    const normalized = normalizeAssetCollections(nextCollections);
    setCollections(normalized);
    safeCache(normalized);
    if (collection) setOpenedCollectionId(collection.id);
    return normalized;
  }

  async function createCollection(name: string, assetIds: string[] = []) {
    const members = membersForAssetIds(assetIds);
    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled collection", members })
      });
      const data = await readCollectionResponse(response);
      if (!data.collection || !data.collections) throw new Error("Collection route did not return a collection.");
      applyCollections(data.collections, data.collection);
      if (assetIds.length) setSelectedAssetIds([]);
      setError("");
      setRecoveryMessage(
        `Created ${data.collection.name}${members.length ? ` with ${members.length} asset${members.length === 1 ? "" : "s"}` : ""}.`
      );
      return data.collection;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create collection.");
      return null;
    }
  }

  async function patchCollection(collectionId: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/collections?id=${encodeURIComponent(collectionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await readCollectionResponse(response);
    if (!data.collection || !data.collections) throw new Error("Collection route did not return a collection.");
    applyCollections(data.collections, data.collection);
    return data.collection;
  }

  async function addMembersToCollection(collectionId: string, addMembers: AssetCollectionMember[]) {
    if (!addMembers.length) {
      setError("Select at least one resolvable asset for this collection.");
      return null;
    }
    try {
      const collection = await patchCollection(collectionId, { addMembers });
      setError("");
      setRecoveryMessage(`Added ${addMembers.length} asset${addMembers.length === 1 ? "" : "s"} to ${collection.name}.`);
      return collection;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add assets to collection.");
      return null;
    }
  }

  async function addAssetsToCollection(collectionId: string, assetIds: string[], kind?: AssetCollectionMemberKind) {
    return addMembersToCollection(collectionId, membersForAssetIds(assetIds, kind));
  }

  async function addSelectedAssetsToAssetCollection(collectionId: string) {
    const collection = await addAssetsToCollection(collectionId, selectedAssetIds);
    if (collection) setSelectedAssetIds([]);
    return collection;
  }

  async function addFilesToCollection(
    collectionId: string,
    files: File[],
    kind: AssetCollectionMemberKind = "input"
  ) {
    const imported = await importImageAssetFiles(files, {
      assetKind: kind === "generation" ? "output" : kind === "asset" ? "asset" : "input",
      focusAssetsTab: false
    });
    if (!imported.length) return null;
    return addMembersToCollection(collectionId, collectionMembersFromAssets(imported, kind));
  }

  async function removeAssetFromCollection(collectionId: string, assetId: string) {
    try {
      const response = await fetch(
        `/api/collections?id=${encodeURIComponent(collectionId)}&assetId=${encodeURIComponent(assetId)}`,
        { method: "DELETE" }
      );
      const data = await readCollectionResponse(response);
      if (!data.collection || !data.collections) throw new Error("Collection route did not return a collection.");
      applyCollections(data.collections, data.collection);
      setError("");
      setRecoveryMessage(`Removed asset from ${data.collection.name}.`);
      return data.collection;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not remove asset from collection.");
      return null;
    }
  }

  async function deleteAssetCollection(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    try {
      const response = await fetch(`/api/collections?id=${encodeURIComponent(collectionId)}`, { method: "DELETE" });
      const data = await readCollectionResponse(response);
      applyCollections(data.collections || []);
      if (openedCollectionId === collectionId) setOpenedCollectionId(null);
      setError("");
      setRecoveryMessage(`Deleted ${collection?.name || "collection"}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not delete collection.");
    }
  }

  async function exportAssetCollection(collectionId: string) {
    const collection = collections.find((item) => item.id === collectionId);
    if (!collection) {
      setError("Open or select a collection before exporting.");
      return;
    }
    try {
      const result = await downloadAssetCollectionZip(collection, assets);
      setError("");
      setRecoveryMessage(
        `Exported ${collection.name}${result.skipped.length ? `; skipped ${result.skipped.length} missing image${result.skipped.length === 1 ? "" : "s"}.` : "."}`
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not export collection.");
    }
  }

  function replaceCollectionLocally(collection: AssetCollection) {
    setCollections((current) => upsertAssetCollection(current, collection));
  }

  return {
    assetCollections: collections,
    collectionFilter,
    setCollectionFilter,
    openedCollection,
    openedCollectionId,
    setOpenedCollectionId,
    createAssetCollection: createCollection,
    addAssetsToCollection,
    addSelectedAssetsToAssetCollection,
    addFilesToCollection,
    removeAssetFromCollection,
    deleteAssetCollection,
    exportAssetCollection,
    replaceCollectionLocally
  };
}
