import type { AssetRecord } from "./types";
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
  const imageUrl = row.sampleUrl || row.imageUrl || imageDataUrl;

  return {
    id: row.id,
    title: row.title || row.id,
    createdAt,
    timestamp: row.timestamp || Date.parse(createdAt) || Date.now(),
    imageDataUrl,
    imageUrl,
    image_url: imageUrl,
    sampleUrl: row.sampleUrl || imageUrl,
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
    creditsBefore: row.creditsBefore ?? null,
    creditsAfter: row.creditsAfter ?? null,
    creditDelta: row.creditDelta ?? null,
    remoteImageKey: row.remoteImageKey ?? null,
    remotePromptKey: row.remotePromptKey ?? null,
    remoteMetadataKey: row.remoteMetadataKey ?? null
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

export async function fetchRemoteOutputManifest(limit = 200): Promise<OutputManifestItem[]> {
  if (!remoteArchiveConfig()) return [];

  const data = await requestArchiveJson<{ assets: RemoteAsset[] }>(`/api/assets?limit=${limit}`);
  return (Array.isArray(data.assets) ? data.assets : []).map((asset) => ({
    id: asset.id,
    title: asset.title || asset.id,
    model: asset.model,
    promptTokens: estimateTokens(asset.prompt || ""),
    sampleUrl: asset.sampleUrl || undefined,
    costCredits: asset.costCredits ?? null,
    creditsBefore: asset.creditsBefore ?? null,
    creditsAfter: asset.creditsAfter ?? null,
    createdAt: asset.createdAt || null,
    remoteImageKey: asset.remoteImageKey ?? null,
    remotePromptKey: asset.remotePromptKey ?? null,
    remoteMetadataKey: asset.remoteMetadataKey ?? null
  }));
}
