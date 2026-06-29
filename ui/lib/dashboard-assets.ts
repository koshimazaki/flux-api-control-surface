import {
  AIMEDIA_LIBRARY_KEY,
  BFL_LIBRARY_KEY,
  deleteAssetImage,
  loadAssetImage,
  readRecoverableLibraryRecords,
  saveAssetImage,
  stripAssetForStorage,
  toAimediaRecord
} from "./asset-storage";
import type { AssetRecord } from "./types";

const OUTPUT_RECOVERY_LIMIT = 60;

export function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Could not persist ${key}`, err);
  }
}

export function mergeAssetRecords(current: AssetRecord[], incoming: AssetRecord[]) {
  const currentById = new Map(current.map((asset) => [asset.id, asset]));
  const incomingById = new Map<string, AssetRecord>();
  let added = 0;
  let changed = false;

  incoming.forEach((asset) => {
    if (!incomingById.has(asset.id)) incomingById.set(asset.id, asset);
  });

  const newIncoming = Array.from(incomingById.values()).filter((asset) => {
    if (currentById.has(asset.id)) return false;
    added += 1;
    changed = true;
    return true;
  });

  const mergedCurrent = current.map((existing) => {
    const asset = incomingById.get(existing.id);
    if (!asset) return existing;
    if (
      existing.title !== asset.title ||
      existing.provider !== asset.provider ||
      existing.operation !== asset.operation ||
      existing.assetKind !== asset.assetKind ||
      existing.imageUrl !== asset.imageUrl ||
      existing.localImagePath !== asset.localImagePath ||
      existing.localMetadataPath !== asset.localMetadataPath ||
      existing.localSvgPath !== asset.localSvgPath
    ) {
      changed = true;
    }
    return {
      ...existing,
      ...asset,
      imageDataUrl: asset.imageDataUrl || existing.imageDataUrl,
      // Server outputs don't persist the reference list, so they come back empty.
      // Keep the references we already have rather than letting the poll wipe them.
      references: asset.references?.length ? asset.references : existing.references,
      is_favorite: existing.is_favorite ?? asset.is_favorite
    };
  });

  return {
    added,
    changed,
    assets: changed ? [...newIncoming, ...mergedCurrent] : current
  };
}

export async function hydrateAssets(records: AssetRecord[]) {
  const unique = mergeAssetRecords([], records).assets;

  return Promise.all(
    unique.map(async (asset) => ({
      ...asset,
      imageDataUrl: asset.imageDataUrl?.startsWith("data:")
        ? asset.imageDataUrl
        : (await loadAssetImage(asset.id)) || asset.imageDataUrl
    }))
  );
}

export async function fetchOutputAssets(): Promise<AssetRecord[]> {
  try {
    const response = await fetch(`/api/outputs?limit=${OUTPUT_RECOVERY_LIMIT}`, { cache: "no-store" });
    if (!response.ok) return [];
    return (await response.json()) as AssetRecord[];
  } catch {
    return [];
  }
}

export async function loadStoredAssets() {
  return hydrateAssets([...(await fetchOutputAssets()), ...readRecoverableLibraryRecords()]);
}

export async function persistAssetLibraries(assets: AssetRecord[]) {
  safeSetItem(BFL_LIBRARY_KEY, JSON.stringify(assets.map(stripAssetForStorage)));
  safeSetItem(AIMEDIA_LIBRARY_KEY, JSON.stringify(assets.map(toAimediaRecord)));
}

export async function recoverStoredAssetRecords(current: AssetRecord[]) {
  const recovered = await loadStoredAssets();
  return mergeAssetRecords(current, recovered);
}

export async function persistAssetImage(id: string, dataUrl: string) {
  await saveAssetImage(id, dataUrl).catch((err) =>
    console.warn("Could not persist generated image blob", err)
  );
}

export function removeAssetImage(id: string) {
  deleteAssetImage(id).catch((err) => console.warn("Could not delete image blob", err));
}

export function removeAssetImages(assets: AssetRecord[]) {
  assets.forEach((asset) => deleteAssetImage(asset.id).catch(() => undefined));
}

export function extensionForAsset(asset: AssetRecord) {
  if (asset.localImagePath?.toLowerCase().endsWith(".png")) return "png";
  if (asset.remoteImageKey?.toLowerCase().endsWith(".png")) return "png";
  if (asset.imageDataUrl?.startsWith("data:image/png")) return "png";
  if (asset.imageDataUrl?.startsWith("data:image/webp")) return "webp";
  if (asset.remoteImageKey?.toLowerCase().endsWith(".webp")) return "webp";
  return "jpg";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function downloadNameForAsset(asset: AssetRecord) {
  const stamp = new Date(asset.timestamp || Date.now()).toISOString().replace(/[:.]/g, "-");
  const title = slugify(asset.title || asset.id || "bfl-output") || "bfl-output";
  const shortId = slugify(asset.id || "").slice(0, 36);
  return [stamp, title, shortId].filter(Boolean).join("_");
}
