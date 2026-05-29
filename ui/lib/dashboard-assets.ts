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

export function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Could not persist ${key}`, err);
  }
}

export async function hydrateAssets(records: AssetRecord[]) {
  const seen = new Set<string>();
  const unique = records.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });

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
    const response = await fetch("/api/outputs", { cache: "no-store" });
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
  let added = 0;
  const seen = new Set(current.map((asset) => asset.id));
  const merged = [...current];

  recovered.forEach((asset) => {
    if (!seen.has(asset.id)) {
      seen.add(asset.id);
      merged.unshift(asset);
      added += 1;
    }
  });

  return { added, assets: merged };
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
