import { estimateTokens } from "./pricing";
import type { AssetRecord, RunLogEntry } from "./types";

export type ToolApiMode = "erase" | "vto" | "outpaint" | "deblur";
export type ToolOutputFormat = "png" | "jpeg" | "webp";

export type ToolRunInput = {
  mode: ToolApiMode;
  sourceAsset: AssetRecord;
  vtoGarments: AssetRecord[];
  apiKey: string;
  mask: string;
  prompt: string;
  seed: string;
  dilatePixels: number;
  guidance: number;
  steps: number;
  safetyTolerance: number;
  outputFormat: ToolOutputFormat;
  autoCrop: boolean;
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
  input: Pick<ToolRunInput, "mode" | "mask" | "prompt"> & { garmentCount?: number; hasSource: boolean }
) {
  if (!input.hasSource) return "Select a source image from the assets library.";
  if (input.mode === "erase" && !input.mask) {
    return "Paint a mask over the area you want to change first.";
  }
  if (input.mode === "vto" && !input.garmentCount) {
    return "Add at least one garment reference for Virtual Try-On.";
  }
  if (input.mode === "vto" && !input.prompt.trim()) {
    return "Virtual Try-On needs a styling prompt.";
  }
  return "";
}

function parsedOffset(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toolSafetyToleranceMax(_mode: ToolApiMode) {
  return 5;
}

function toolSupportsSafetyTolerance(mode: ToolApiMode) {
  return mode === "vto" || mode === "deblur";
}

function clampToolSafetyTolerance(mode: ToolApiMode, value: number) {
  return Math.max(0, Math.min(toolSafetyToleranceMax(mode), Math.round(value)));
}

function toolOutputFormat(mode: ToolApiMode, value: ToolOutputFormat): ToolOutputFormat {
  if (mode === "erase" || mode === "outpaint") {
    return value === "jpeg" ? "jpeg" : "png";
  }
  return value;
}

function compactTitlePart(value?: string, fallback = "asset") {
  const trimmed = value?.trim().replace(/\s+/g, " ") || "";
  return (trimmed || fallback).slice(0, 72);
}

function noPromptLabel(mode: ToolApiMode) {
  return `[${mode} pass, no prompt]`;
}

export function toolSubmittedPrompt(input: Pick<ToolRunInput, "mode" | "prompt">) {
  if (input.mode === "vto" || input.mode === "outpaint") {
    return input.prompt.trim() || noPromptLabel(input.mode);
  }
  return noPromptLabel(input.mode);
}

export function buildToolTitle(input: Pick<ToolRunInput, "mode" | "prompt" | "sourceAsset" | "vtoGarments">) {
  const sourceTitle = compactTitlePart(input.sourceAsset.title || input.sourceAsset.id);
  const promptTitle = compactTitlePart(input.prompt, "");
  if (input.mode === "vto") {
    const garmentTitle = input.vtoGarments[0] ? compactTitlePart(input.vtoGarments[0].title || input.vtoGarments[0].id) : "";
    return ["vto", promptTitle || sourceTitle, garmentTitle ? `garment ${garmentTitle}` : ""].filter(Boolean).join(" - ");
  }
  if (input.mode === "outpaint") {
    return ["outpaint", promptTitle || sourceTitle].filter(Boolean).join(" - ");
  }
  return `${input.mode} - ${sourceTitle}`;
}

export function buildToolRequestBody(input: ToolRunInput) {
  const seed = input.seed.trim() ? Number(input.seed) : null;
  const title = buildToolTitle(input);
  return {
    apiKey: input.apiKey.trim() || undefined,
    tool: input.mode,
    image: assetImageSource(input.sourceAsset),
    mask: input.mode === "erase" ? input.mask : undefined,
    prompt: input.mode === "vto" || input.mode === "outpaint" ? input.prompt : undefined,
    garments: input.mode === "vto" ? input.vtoGarments.map((asset) => assetImageSource(asset)).filter(Boolean) : undefined,
    seed: Number.isFinite(seed as number) ? seed : null,
    dilatePixels: input.dilatePixels,
    guidance: undefined,
    steps: undefined,
    safetyTolerance: toolSupportsSafetyTolerance(input.mode)
      ? clampToolSafetyTolerance(input.mode, input.safetyTolerance)
      : undefined,
    autoCrop: input.mode === "outpaint" ? input.autoCrop : undefined,
    canvasWidth: input.mode === "outpaint" ? input.canvasWidth : undefined,
    canvasHeight: input.mode === "outpaint" ? input.canvasHeight : undefined,
    offsetX: parsedOffset(input.offsetX),
    offsetY: parsedOffset(input.offsetY),
    mode: input.mode === "outpaint" ? input.outpaintMode : undefined,
    outputFormat: toolOutputFormat(input.mode, input.outputFormat),
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
  const title = buildToolTitle(input);
  const submittedPrompt = toolSubmittedPrompt(input);
  return {
    id: assetId,
    title,
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    imageDataUrl: data.imageDataUrl,
    imageUrl: data.sampleUrl,
    image_url: data.sampleUrl,
    sampleUrl: data.sampleUrl,
    model: data.model || data.endpointName,
    prompt: submittedPrompt,
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
    operation: input.mode,
    assetKind: "output"
  };
}

export function buildVtoGarmentCompositeAsset(data: any, input: ToolRunInput): AssetRecord | null {
  const composite = data.garmentComposite;
  if (input.mode !== "vto" || !composite?.imageDataUrl) return null;
  const timestamp = Date.now();
  const assetId = composite.id || `${data.id || `tool-${timestamp}`}-garment-collage`;
  const outputUrl = `/api/outputs/${encodeURIComponent(assetId)}/image`;
  const garmentNames = input.vtoGarments
    .map((asset) => compactTitlePart(asset.title || asset.id, "garment"))
    .filter(Boolean);
  const title = composite.title || ["VTO garment collage", garmentNames.slice(0, 2).join(" + ")].filter(Boolean).join(" - ");
  return {
    id: assetId,
    title,
    createdAt: new Date(timestamp).toISOString(),
    timestamp,
    imageDataUrl: composite.imageDataUrl,
    imageUrl: outputUrl,
    image_url: outputUrl,
    sampleUrl: outputUrl,
    model: "vto-garment-composite",
    prompt: `[vto garment collage sent to BFL] ${input.prompt.trim()}`.trim(),
    status: "complete",
    width: composite.width,
    height: composite.height,
    aspectRatio: composite.width && composite.height ? `${composite.width}:${composite.height}` : "1:1",
    provider: "local-vto-preflight",
    payload: {
      sourceAssetId: input.sourceAsset.id,
      garmentSummary: data.garmentSummary || null,
      garmentCount: composite.count,
      garmentAssetIds: input.vtoGarments.map((asset) => asset.id)
    },
    references: input.vtoGarments.map((asset, index) => ({
      id: asset.id,
      name: asset.title || asset.id || `garment ${index + 1}`,
      value: assetImageSource(asset),
      assetId: asset.id
    })),
    runSettings: {
      provider: "local-vto-preflight",
      operation: "vto-garment-composite",
      sourceAssetId: input.sourceAsset.id,
      garmentCount: composite.count,
      sentToBflAs: "garment"
    },
    sourceAssetId: input.sourceAsset.id,
    operation: "vto-garment-composite",
    assetKind: "asset",
    localImagePath: composite.outputFiles?.imagePath ?? null,
    localPromptPath: composite.outputFiles?.promptPath ?? null,
    localMetadataPath: composite.outputFiles?.metadataPath ?? null
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
  const submittedPrompt = toolSubmittedPrompt(input);
  return {
    id: `failed-${input.mode}-${Date.now()}`,
    title: buildToolTitle(input),
    timestamp: Date.now(),
    model: input.mode,
    status: "failed",
    promptTokens: estimateTokens(submittedPrompt),
    estimatedCredits: 0,
    durationMs: Date.now() - started,
    error: message,
    prompt: submittedPrompt
  };
}
