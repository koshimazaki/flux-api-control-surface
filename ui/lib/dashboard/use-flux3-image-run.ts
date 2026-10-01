import { useState, type Dispatch, type SetStateAction } from "react";
import { persistAssetImage } from "@/lib/dashboard-assets";
import { normalizeFlux3ImageSettings, type Flux3ImageRequest } from "@/lib/flux3-image";
import { estimateTokens } from "@/lib/pricing";
import type { AssetRecord, BalanceState, ReferenceImage, RunLogEntry } from "@/lib/types";

/** One FLUX 3 Image run as the workspace hands it over. */
export type Flux3ImageRunInput = {
  request: Flux3ImageRequest;
  title: string;
  /** Library ids behind the references or the edit source. */
  sourceAssetIds: string[];
  referenceMeta?: Array<Partial<ReferenceImage>>;
};

export async function executeFlux3ImageRun(body: Record<string, unknown>) {
  const response = await fetch("/api/bfl/flux3-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "FLUX 3 Image generation failed.");
  return data;
}

/** The output's real size, read from the saved image; the API sets it from the aspect ratio and tier. */
async function imageSize(dataUrl: string) {
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: undefined, height: undefined };
  }
}

export async function buildFlux3ImageAssetRecord(data: any, input: Flux3ImageRunInput): Promise<AssetRecord> {
  const settings = normalizeFlux3ImageSettings(input.request.settings);
  const { width, height } = await imageSize(data.imageDataUrl);
  return {
    id: data.id || `flux3-image-${Date.now()}`,
    title: input.title,
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    imageDataUrl: data.imageDataUrl,
    imageUrl: data.sampleUrl,
    image_url: data.sampleUrl,
    sampleUrl: data.sampleUrl,
    model: "flux-3-image",
    prompt: input.request.prompt?.trim() || "",
    status: "complete",
    width,
    height,
    aspectRatio: settings.aspectRatio === "auto" && width && height ? `${width}:${height}` : settings.aspectRatio,
    provider: "bfl-api",
    payload: data.payload || {},
    references: (input.referenceMeta || []).filter((meta): meta is ReferenceImage => Boolean(meta?.id && meta.value)),
    runSettings: { ...data.runSettings, flux3Image: data.flux3Image },
    costCredits: data.submit?.cost ?? data.submit?.creditDelta ?? null,
    inputMp: data.submit?.inputMp ?? null,
    outputMp: data.submit?.outputMp ?? null,
    creditsBefore: data.submit?.creditsBefore ?? null,
    creditsAfter: data.submit?.creditsAfter ?? null,
    creditDelta: data.submit?.creditDelta ?? null,
    localImagePath: data.outputFiles?.imagePath ?? null,
    localPromptPath: data.outputFiles?.promptPath ?? null,
    localMetadataPath: data.outputFiles?.metadataPath ?? null,
    sourceAssetId: input.sourceAssetIds[0] ?? null,
    operation: `flux3-image:${input.request.mode}`
  };
}

function runLogEntry(input: Flux3ImageRunInput, started: number, outcome: { asset?: AssetRecord; error?: string }): RunLogEntry {
  const { asset, error } = outcome;
  return {
    id: asset?.id ?? `failed-flux3-image-${Date.now()}`,
    title: input.title,
    timestamp: Date.now(),
    model: "flux-3-image",
    status: error ? "failed" : "complete",
    promptTokens: estimateTokens(input.request.prompt || ""),
    estimatedCredits: 0,
    actualCredits: asset?.costCredits,
    creditsBefore: asset?.creditsBefore,
    creditsAfter: asset?.creditsAfter,
    creditDelta: asset?.creditDelta,
    durationMs: Date.now() - started,
    error,
    prompt: input.request.prompt,
    width: asset?.width,
    height: asset?.height
  };
}

type Flux3ImageRunDeps = {
  apiKey: string;
  balance: BalanceState;
  setAssets: Dispatch<SetStateAction<AssetRecord[]>>;
  setRunLog: Dispatch<SetStateAction<RunLogEntry[]>>;
  setBalance: (balance: BalanceState) => void;
  setSelectedAsset: (asset: AssetRecord | null) => void;
  setError: (message: string) => void;
  setRecoveryMessage: (message: string) => void;
};

/** Runs FLUX 3 Image through the queue-backed route and files the result like any generation. */
export function useFlux3ImageRun(deps: Flux3ImageRunDeps) {
  const [isFlux3ImageRunning, setIsFlux3ImageRunning] = useState(false);

  async function runFlux3Image(input: Flux3ImageRunInput) {
    const started = Date.now();
    deps.setError("");
    setIsFlux3ImageRunning(true);
    try {
      const data = await executeFlux3ImageRun({
        ...input.request,
        apiKey: deps.apiKey || undefined,
        title: input.title,
        sourceAssetIds: input.sourceAssetIds,
        referenceMeta: input.referenceMeta
      });
      const asset = await buildFlux3ImageAssetRecord(data, input);
      await persistAssetImage(asset.id, data.imageDataUrl);
      deps.setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      deps.setBalance({ credits: data.submit?.creditsAfter ?? deps.balance.credits, checkedAt: Date.now() });
      deps.setRunLog((current) => [runLogEntry(input, started, { asset }), ...current]);
      deps.setSelectedAsset(asset);
      deps.setRecoveryMessage(`FLUX 3 Image saved: ${input.title}.`);
      return asset;
    } catch (error) {
      const message = error instanceof Error ? error.message : "FLUX 3 Image generation failed.";
      deps.setRunLog((current) => [runLogEntry(input, started, { error: message }), ...current]);
      deps.setError(message);
      return null;
    } finally {
      setIsFlux3ImageRunning(false);
    }
  }

  return { runFlux3Image, isFlux3ImageRunning };
}
