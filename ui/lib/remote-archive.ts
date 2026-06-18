import type { AssetRecord, TrainingCollection, TrainingCollectionItem } from "./types";
import type { OutputManifestItem } from "./server-output-store";
import { estimateTokens } from "./pricing";

type RemoteArchiveConfig = {
  baseUrl: string;
  token: string;
};

type RemoteAsset = {
  id: string;
  title?: string;
  prompt?: string;
  model?: string;
  width?: number;
  height?: number;
  seed?: number | null;
  createdAt?: string;
  timestamp?: number;
  sampleUrl?: string | null;
  imageUrl?: string | null;
  payload?: Record<string, unknown>;
  runSettings?: Record<string, unknown>;
  costCredits?: number | null;
  inputMp?: number | null;
  outputMp?: number | null;
  creditsBefore?: number | null;
  creditsAfter?: number | null;
  creditDelta?: number | null;
  remoteImageKey?: string | null;
  remotePromptKey?: string | null;
  remoteMetadataKey?: string | null;
  remoteImageUrl?: string | null;
  r2RootPrefix?: string | null;
};

export type RemoteReference = {
  id: string;
  setId: string;
  title?: string;
  fileName?: string;
  prompt?: string;
  caption?: string;
  mimeType?: string;
  createdAt?: string;
  timestamp?: number;
  imageUrl?: string | null;
  remoteImageKey?: string | null;
  remoteMetadataKey?: string | null;
  r2RootPrefix?: string | null;
  metadata?: Record<string, unknown>;
};

export function remoteArchiveConfig(): RemoteArchiveConfig | null {
  const baseUrl = process.env.BFL_ASSET_WORKER_URL?.trim().replace(/\/+$/, "");
  const token = process.env.BFL_ASSET_WORKER_TOKEN?.trim();
  return baseUrl && token ? { baseUrl, token } : null;
}

export function remoteArchiveStatus() {
  const hasUrl = Boolean(process.env.BFL_ASSET_WORKER_URL?.trim());
  const hasToken = Boolean(process.env.BFL_ASSET_WORKER_TOKEN?.trim());
  return {
    configured: hasUrl && hasToken,
    hasUrl,
    hasToken,
    url: hasUrl ? process.env.BFL_ASSET_WORKER_URL?.trim() : null
  };
}

function archiveHeaders(config: RemoteArchiveConfig, contentType = "application/json") {
  return {
    authorization: `Bearer ${config.token}`,
    "content-type": contentType
  };
}

async function requestArchiveJson<T>(path: string, init?: RequestInit): Promise<T> {
  const config = remoteArchiveConfig();
  if (!config) throw new Error("Remote archive is not configured");

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      ...archiveHeaders(config),
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || `Remote archive ${response.status}`);
  }
  return data as T;
}

function assetFromRemote(row: RemoteAsset, imageDataUrl: string): AssetRecord {
  const createdAt = row.createdAt || new Date(row.timestamp || Date.now()).toISOString();

  return {
    id: row.id,
    title: row.title || row.id,
    createdAt,
    timestamp: row.timestamp || Date.parse(createdAt) || Date.now(),
    imageDataUrl,
    imageUrl: imageDataUrl,
    image_url: imageDataUrl,
    sampleUrl: imageDataUrl,
    model: row.model || "bfl-api",
    prompt: row.prompt || "",
    status: "complete",
    width: row.width,
    height: row.height,
    seed: row.seed ?? undefined,
    aspectRatio: row.width && row.height ? `${row.width}:${row.height}` : undefined,
    provider: "bfl-api",
    payload: row.payload || {},
    references: [],
    runSettings: row.runSettings,
    costCredits: row.costCredits ?? null,
    inputMp: row.inputMp ?? null,
    outputMp: row.outputMp ?? null,
    remoteImageKey: row.remoteImageKey ?? null,
    remotePromptKey: row.remotePromptKey ?? null,
    remoteMetadataKey: row.remoteMetadataKey ?? null,
    remoteImageUrl: row.remoteImageUrl || row.imageUrl || null,
    r2RootPrefix: row.r2RootPrefix ?? null
  };
}

async function fetchRemoteImageDataUrl(id: string) {
  const config = remoteArchiveConfig();
  if (!config) throw new Error("Remote archive is not configured");

  const response = await fetch(`${config.baseUrl}/api/assets/${encodeURIComponent(id)}/image`, {
    headers: archiveHeaders(config),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Could not fetch remote image ${id}`);

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function fetchRemoteReferenceImageDataUrl(id: string) {
  const config = remoteArchiveConfig();
  if (!config) throw new Error("Remote archive is not configured");

  const response = await fetch(`${config.baseUrl}/api/references/${encodeURIComponent(id)}/image`, {
    headers: archiveHeaders(config),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Could not fetch remote reference ${id}`);

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

function extensionForFileName(fileName: string, mimeType: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (extension === "png" || extension === "webp" || extension === "jpg" || extension === "jpeg") {
    return extension === "jpeg" ? "jpg" : extension;
  }
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function referenceIdForItem(collection: Pick<TrainingCollection, "id" | "name">, item: TrainingCollectionItem) {
  const collectionSlug = slugify(collection.id || collection.name || "reference-set") || "reference-set";
  const itemSlug = slugify(item.remoteReferenceId || item.assetId || item.id || item.fileName || item.name) || "image";
  return `ref_${collectionSlug}_${itemSlug}`.slice(0, 180);
}

function stripCollectionItemForRemote(item: TrainingCollectionItem) {
  const { imageDataUrl, ...metadata } = item;
  return metadata;
}

function referenceItemFromRemote(reference: RemoteReference, imageDataUrl: string): TrainingCollectionItem {
  const fileName = reference.fileName || `${reference.id}.png`;
  const mimeType = reference.mimeType || imageDataUrl.match(/^data:([^;]+);/)?.[1] || "image/png";

  return {
    id: `remote_${reference.id}`,
    source: "remote",
    name: reference.title || fileName,
    fileName,
    imageDataUrl,
    mimeType,
    prompt: reference.prompt || undefined,
    caption: reference.caption || "",
    remoteReferenceId: reference.id,
    remoteSetId: reference.setId,
    remoteImageKey: reference.remoteImageKey ?? null,
    remoteMetadataKey: reference.remoteMetadataKey ?? null,
    remoteSourceUrl: reference.imageUrl || null,
    addedAt: reference.timestamp || Date.parse(reference.createdAt || "") || Date.now()
  };
}

export async function syncOutputToRemote(options: {
  id: string;
  title: string;
  prompt: string;
  imageBuffer: Buffer;
  contentType: string;
  extension: string;
  fileBaseName: string;
  metadata: Record<string, unknown>;
}) {
  if (!remoteArchiveConfig()) return null;

  return requestArchiveJson<{
    ok: boolean;
    asset: RemoteAsset;
    outputFiles: {
      r2ImageKey: string;
      r2PromptKey: string;
      r2MetadataKey: string;
      r2RootPrefix: string;
      remoteImageUrl: string;
    };
  }>("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      id: options.id,
      title: options.title,
      prompt: options.prompt,
      imageBase64: options.imageBuffer.toString("base64"),
      contentType: options.contentType,
      extension: options.extension,
      fileBaseName: options.fileBaseName,
      metadata: options.metadata
    })
  });
}

export async function syncReferenceItemToRemote(options: {
  collection: Pick<TrainingCollection, "id" | "name" | "triggerToken" | "captionGuide">;
  item: TrainingCollectionItem;
}) {
  if (!remoteArchiveConfig()) return null;

  const mimeType =
    options.item.mimeType ||
    options.item.imageDataUrl.match(/^data:([^;]+);/)?.[1] ||
    "image/png";
  const extension = extensionForFileName(options.item.fileName, mimeType);

  return requestArchiveJson<{
    ok: boolean;
    reference: RemoteReference;
  }>("/api/references", {
    method: "POST",
    body: JSON.stringify({
      id: options.item.remoteReferenceId || referenceIdForItem(options.collection, options.item),
      setId: options.collection.id || slugify(options.collection.name || "reference-set"),
      setName: options.collection.name,
      title: options.item.name,
      fileName: options.item.fileName,
      prompt: options.item.prompt || "",
      caption: options.item.caption || "",
      imageDataUrl: options.item.imageDataUrl,
      contentType: mimeType,
      extension,
      metadata: {
        collection: options.collection,
        item: stripCollectionItemForRemote(options.item)
      }
    })
  });
}

export async function fetchRemoteOutputAssets(limit = 200): Promise<AssetRecord[]> {
  if (!remoteArchiveConfig()) return [];

  const data = await requestArchiveJson<{ assets: RemoteAsset[] }>(`/api/assets?limit=${limit}`);
  const rows = Array.isArray(data.assets) ? data.assets : [];
  const assets = await Promise.all(
    rows.map(async (row) => {
      try {
        return assetFromRemote(row, await fetchRemoteImageDataUrl(row.id));
      } catch {
        return null;
      }
    })
  );

  return assets.filter(Boolean) as AssetRecord[];
}

export async function fetchRemoteReferenceItems(limit = 500, setId?: string): Promise<TrainingCollectionItem[]> {
  if (!remoteArchiveConfig()) return [];

  const params = new URLSearchParams({ limit: String(limit) });
  if (setId) params.set("setId", setId);
  const data = await requestArchiveJson<{ references: RemoteReference[] }>(`/api/references?${params.toString()}`);
  const rows = Array.isArray(data.references) ? data.references : [];
  const items = await Promise.all(
    rows.map(async (row) => {
      try {
        return referenceItemFromRemote(row, await fetchRemoteReferenceImageDataUrl(row.id));
      } catch {
        return null;
      }
    })
  );

  return items.filter(Boolean) as TrainingCollectionItem[];
}

export async function fetchRemoteOutputManifest(limit = 200): Promise<OutputManifestItem[]> {
  if (!remoteArchiveConfig()) return [];

  const data = await requestArchiveJson<{ assets: RemoteAsset[] }>(`/api/assets?limit=${limit}`);
  return (Array.isArray(data.assets) ? data.assets : []).map((asset) => ({
    id: asset.id,
    title: asset.title || asset.id,
    model: asset.model,
    promptTokens: estimateTokens(asset.prompt || ""),
    costCredits: asset.costCredits ?? null,
    createdAt: asset.createdAt || null,
    remoteImageKey: asset.remoteImageKey ?? null,
    remotePromptKey: asset.remotePromptKey ?? null,
    remoteMetadataKey: asset.remoteMetadataKey ?? null
  }));
}
