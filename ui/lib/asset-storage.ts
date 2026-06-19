import type { AssetKind, AssetRecord } from "./types";

export const AIMEDIA_LIBRARY_KEY = "nb2_generations";
export const BFL_LIBRARY_KEY = "bfl-flower-assets";
export const LEGACY_GENERATION_HISTORY_KEY = "generation-history";
export const RUN_LOG_KEY = "bfl-run-log";

const ASSET_DB_NAME = "bfl-flower-workbench";
const ASSET_STORE_NAME = "images";

function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ASSET_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAssetImage(id: string, imageDataUrl: string) {
  const db = await openAssetDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(ASSET_STORE_NAME).put(imageDataUrl, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function loadAssetImage(id: string): Promise<string | null> {
  const db = await openAssetDb();
  const value = await new Promise<string | null>((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, "readonly");
    const request = transaction.objectStore(ASSET_STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as string | undefined) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function deleteAssetImage(id: string) {
  const db = await openAssetDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(ASSET_STORE_NAME, "readwrite");
    transaction.objectStore(ASSET_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function sanitizePayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      typeof value === "string" && value.startsWith("data:") ? "[stored reference omitted]" : value
    ])
  );
}

function normalizeAssetKind(value: unknown, fallback: AssetKind): AssetKind {
  return value === "output" || value === "input" || value === "reference" || value === "asset"
    ? value
    : fallback;
}

function inferAssetKind(item: any): AssetKind {
  if (item.operation === "glyphs" || item.provider === "local-glyph") return "asset";
  if (String(item.provider || "").startsWith("local")) return "input";
  return "output";
}

export function stripAssetForStorage(asset: AssetRecord) {
  const fallbackUrl = asset.sampleUrl || asset.imageUrl || asset.image_url;
  return {
    ...asset,
    imageDataUrl: undefined,
    imageUrl: fallbackUrl,
    image_url: fallbackUrl,
    payload: sanitizePayload(asset.payload),
    references: asset.references.map((reference) => ({
      ...reference,
      value: reference.value.startsWith("data:") ? "[stored reference omitted]" : reference.value
    }))
  };
}

export function normalizeLibraryRecord(item: any): AssetRecord | null {
  const imageUrl = item.imageDataUrl || item.imageUrl || item.image_url || item.sampleUrl;
  if (!imageUrl) return null;
  return {
    id: item.id || `asset-${Date.now()}`,
    title: item.title,
    createdAt: item.createdAt || new Date(item.timestamp || Date.now()).toISOString(),
    timestamp: item.timestamp || Date.now(),
    imageDataUrl: imageUrl,
    imageUrl,
    image_url: imageUrl,
    sampleUrl: item.sampleUrl || imageUrl,
    model: item.model || item.generator || "bfl",
    prompt: item.prompt || "",
    status: "complete",
    is_favorite: item.is_favorite,
    width: item.width,
    height: item.height,
    seed: item.seed,
    aspectRatio: item.aspectRatio,
    provider: item.provider || "bfl-api",
    payload: item.payload || item.request || {},
    references: item.references || [],
    runSettings: item.runSettings,
    costCredits: item.costCredits,
    inputMp: item.inputMp,
    outputMp: item.outputMp,
    creditsBefore: item.creditsBefore,
    creditsAfter: item.creditsAfter,
    creditDelta: item.creditDelta,
    localImagePath: item.localImagePath,
    localPromptPath: item.localPromptPath,
    localMetadataPath: item.localMetadataPath,
    localSvgPath: item.localSvgPath,
    remoteImageKey: item.remoteImageKey,
    remotePromptKey: item.remotePromptKey,
    remoteMetadataKey: item.remoteMetadataKey,
    remoteImageUrl: item.remoteImageUrl,
    r2RootPrefix: item.r2RootPrefix,
    sourceAssetId: item.sourceAssetId ?? null,
    operation: item.operation ?? null,
    assetKind: normalizeAssetKind(item.assetKind, inferAssetKind(item))
  };
}

function recordsFromStoredValue(raw: string | null): unknown[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.generations)) return parsed.generations;
  if (Array.isArray(parsed.state?.generations)) return parsed.state.generations;
  if (Array.isArray(parsed.items)) return parsed.items;
  return [];
}

export function readRecoverableLibraryRecords(): AssetRecord[] {
  const keys = [BFL_LIBRARY_KEY, AIMEDIA_LIBRARY_KEY, LEGACY_GENERATION_HISTORY_KEY];
  const seen = new Set<string>();
  const recovered: AssetRecord[] = [];

  keys.forEach((key) => {
    try {
      recordsFromStoredValue(localStorage.getItem(key)).forEach((item) => {
        const asset = normalizeLibraryRecord(item);
        if (!asset || seen.has(asset.id)) return;
        seen.add(asset.id);
        recovered.push(asset);
      });
    } catch (error) {
      console.warn(`Could not recover ${key}`, error);
    }
  });

  return recovered;
}

export function toAimediaRecord(asset: AssetRecord) {
  return {
    id: asset.id,
    title: asset.title,
    prompt: asset.prompt,
    imageUrl: asset.sampleUrl || asset.imageUrl,
    image_url: asset.sampleUrl || asset.image_url,
    status: asset.status,
    timestamp: asset.timestamp,
    is_favorite: asset.is_favorite,
    width: asset.width,
    height: asset.height,
    seed: asset.seed,
    model: asset.model,
    provider: asset.provider,
    aspectRatio: asset.aspectRatio,
    request: sanitizePayload(asset.payload),
    runSettings: asset.runSettings,
    costCredits: asset.costCredits,
    creditsBefore: asset.creditsBefore,
    creditsAfter: asset.creditsAfter,
    creditDelta: asset.creditDelta,
    localImagePath: asset.localImagePath,
    localPromptPath: asset.localPromptPath,
    localMetadataPath: asset.localMetadataPath,
    localSvgPath: asset.localSvgPath,
    remoteImageKey: asset.remoteImageKey,
    remotePromptKey: asset.remotePromptKey,
    remoteMetadataKey: asset.remoteMetadataKey,
    remoteImageUrl: asset.remoteImageUrl,
    r2RootPrefix: asset.r2RootPrefix,
    assetKind: asset.assetKind
  };
}
