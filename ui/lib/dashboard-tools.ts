import { estimateTokens } from "./pricing";
import type { AssetRecord, RunLogEntry } from "./types";

export type ToolApiMode = "erase" | "inpaint" | "outpaint";

export type ToolRunInput = {
  mode: ToolApiMode;
  sourceAsset: AssetRecord;
  apiKey: string;
  mask: string;
  prompt: string;
  seed: string;
  dilatePixels: number;
  canvasWidth: number;
  canvasHeight: number;
  offsetX: string;
  offsetY: string;
  outpaintMode: "high" | "fast";
};

export function assetImageSource(asset: AssetRecord | null) {
  return asset?.imageDataUrl || asset?.sampleUrl || asset?.imageUrl || asset?.image_url || "";
}

export function toolRunBlocker(
  input: Pick<ToolRunInput, "mode" | "mask" | "prompt"> & { hasSource: boolean }
) {
  if (!input.hasSource) return "Select a source image from the output library.";
  if ((input.mode === "erase" || input.mode === "inpaint") && !input.mask) {
    return "Paint a mask over the area you want to change first.";
  }
  if (input.mode === "inpaint" && !input.prompt.trim()) {
    return "Inpaint needs a prompt describing the replacement (use Erase for prompt-free removal).";
  }
  return "";
}

function parsedOffset(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

export function buildToolRequestBody(input: ToolRunInput) {
  const seed = input.seed.trim() ? Number(input.seed) : null;
  const title = `${input.mode}-${input.sourceAsset.title || input.sourceAsset.id}`;
  return {
    apiKey: input.apiKey,
    tool: input.mode,
    image: assetImageSource(input.sourceAsset),
    mask: input.mode === "outpaint" ? undefined : input.mask,
    prompt: input.mode === "erase" ? undefined : input.prompt,
    seed: Number.isFinite(seed as number) ? seed : null,
    dilatePixels: input.dilatePixels,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight,
    offsetX: parsedOffset(input.offsetX),
    offsetY: parsedOffset(input.offsetY),
    mode: input.outpaintMode,
    outputFormat: "png" as const,
    title,
    sourceAssetId: input.sourceAsset.id
  };
}

export async function executeToolRun(body: Record<string, unknown>) {
  const response = await fetch("/api/bfl/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Tool run failed");
  return data;
}

export function buildToolAssetRecord(data: any, input: ToolRunInput): AssetRecord {
  const assetId = data.id || `tool-${Date.now()}`;
  return {
    id: assetId,
    title: `${input.mode}: ${input.sourceAsset.title || input.sourceAsset.id}`,
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    imageDataUrl: data.imageDataUrl,
    imageUrl: data.sampleUrl,
    image_url: data.sampleUrl,
    sampleUrl: data.sampleUrl,
    model: data.model || data.endpointName,
    prompt: input.mode === "erase" ? input.sourceAsset.prompt : input.prompt || input.sourceAsset.prompt,
    status: "complete",
    width: input.mode === "outpaint" ? input.canvasWidth : input.sourceAsset.width,
    height: input.mode === "outpaint" ? input.canvasHeight : input.sourceAsset.height,
    seed: input.seed.trim() ? Number(input.seed) : undefined,
    aspectRatio:
      input.mode === "outpaint"
        ? `${input.canvasWidth}:${input.canvasHeight}`
        : input.sourceAsset.aspectRatio,
    provider: "bfl-api",
    payload: data.payload || {},
    references: [],
    runSettings: data.runSettings,
    costCredits: data.submit?.cost ?? data.submit?.creditDelta ?? null,
    inputMp: data.submit?.inputMp ?? null,
    outputMp: data.submit?.outputMp ?? null,
    creditsBefore: data.submit?.creditsBefore ?? null,
    creditsAfter: data.submit?.creditsAfter ?? null,
    creditDelta: data.submit?.creditDelta ?? null,
    localImagePath: data.outputFiles?.imagePath ?? null,
    localPromptPath: data.outputFiles?.promptPath ?? null,
    localMetadataPath: data.outputFiles?.metadataPath ?? null,
    remoteImageKey: data.outputFiles?.remote?.outputFiles?.r2ImageKey ?? null,
    remotePromptKey: data.outputFiles?.remote?.outputFiles?.r2PromptKey ?? null,
    remoteMetadataKey: data.outputFiles?.remote?.outputFiles?.r2MetadataKey ?? null,
    remoteImageUrl: data.outputFiles?.remote?.outputFiles?.remoteImageUrl ?? null,
    r2RootPrefix: data.outputFiles?.remote?.outputFiles?.r2RootPrefix ?? null,
    sourceAssetId: input.sourceAsset.id,
    operation: input.mode
  };
}

export function buildToolRunLogEntry(asset: AssetRecord, started: number): RunLogEntry {
  return {
    id: asset.id,
    title: asset.title || asset.id,
    timestamp: asset.timestamp,
    model: asset.model,
    status: "complete",
    promptTokens: estimateTokens(asset.prompt),
    estimatedCredits: 0,
    actualCredits: asset.costCredits,
    creditsBefore: asset.creditsBefore,
    creditsAfter: asset.creditsAfter,
    creditDelta: asset.creditDelta,
    durationMs: Date.now() - started,
    prompt: asset.prompt,
    width: asset.width,
    height: asset.height
  };
}

export function buildToolFailureLogEntry(input: ToolRunInput, started: number, message: string): RunLogEntry {
  return {
    id: `failed-${input.mode}-${Date.now()}`,
    title: `${input.mode}: ${input.sourceAsset.title || input.sourceAsset.id}`,
    timestamp: Date.now(),
    model: input.mode,
    status: "failed",
    promptTokens: estimateTokens(input.prompt || ""),
    estimatedCredits: 0,
    durationMs: Date.now() - started,
    error: message,
    prompt: input.prompt
  };
}
