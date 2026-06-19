import { compactPrompt } from "./prompt-utils";
import { estimateTokens } from "./pricing";
import {
  normalizeReferenceRole,
  referenceDisplayName,
  referenceRoleConfig,
  referenceRoleToken,
  referenceRoleTokenPattern,
  referenceToken
} from "./reference-roles";
import type { AssetRecord, BatchMode, ReferenceImage, ReferenceRole, RunLogEntry } from "./types";

export type BatchProgress = { current: number; total: number };

export type PlanRequestItem = {
  title: string;
  endpoint: string;
  method: string;
  body: Record<string, any>;
  batchIndex: number;
  batchTotal: number;
  promptTokens: number;
  estimatedCredits: number;
  estimatedUsd: number;
};

export function countPairPermutations(sourceCount: number) {
  return sourceCount < 2 ? 0 : (sourceCount * (sourceCount - 1)) / 2;
}

export function composePrompt(baseText: string, references: ReferenceImage[], referenceCue: string) {
  const base = compactPrompt(baseText);
  return references.some((reference) => Boolean(reference.value))
    ? `${base}\n\nReference roles: ${referenceCue}`
    : base;
}

export function promptImageTokenNumbers(prompt: string) {
  const seen = new Set<number>();
  for (const match of prompt.matchAll(/@img(\d+)/gi)) {
    const index = Number(match[1]);
    if (Number.isInteger(index) && index > 0) seen.add(index);
  }
  return Array.from(seen).sort((left, right) => left - right);
}

export function missingPromptImageTokens(prompt: string, references: ReferenceImage[]) {
  return promptImageTokenNumbers(prompt).filter((index) => !references[index - 1]?.value);
}

export function promptReferenceRoleTokens(prompt: string) {
  const seen = new Set<ReferenceRole>();
  for (const match of prompt.matchAll(referenceRoleTokenPattern)) {
    seen.add(normalizeReferenceRole(match[1]));
  }
  return Array.from(seen);
}

export function missingPromptReferenceRoleTokens(prompt: string, references: ReferenceImage[]) {
  const activeRoles = new Set(
    references
      .map((reference, index) => (reference.value ? normalizeReferenceRole(reference.role, index) : null))
      .filter(Boolean) as ReferenceRole[]
  );
  return promptReferenceRoleTokens(prompt).filter((role) => !activeRoles.has(role));
}

export function clampReferenceWeight(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? Math.round(value) : 80));
}

export function referenceWeightCue(weight: number) {
  const clamped = clampReferenceWeight(weight);
  if (clamped <= 20) return `Reference influence: ${clamped}/100. Use the image as a loose visual hint only; let the text prompt dominate.`;
  if (clamped <= 60) return `Reference influence: ${clamped}/100. Blend the image with the text prompt; preserve only the useful silhouette, material, or mood.`;
  if (clamped < 90) return `Reference influence: ${clamped}/100. Follow the reference image strongly while preserving the requested prompt subject.`;
  return `Reference influence: ${clamped}/100. Treat the reference image as a dominant visual anchor for structure, pose, and material.`;
}

export function weightedReferenceCue(referenceCue: string, weight: number) {
  return `${referenceCue.trim()}\n${referenceWeightCue(weight)}`.trim();
}

export function buildReferenceCue(referenceCue: string, weight: number, references: ReferenceImage[]) {
  const activeReferences = references.filter((reference) => Boolean(reference.value));
  const referenceMap = activeReferences.map((reference, index) => {
    const imageField = index === 0 ? "input_image" : `input_image_${index + 1}`;
    const name = referenceDisplayName(reference, index);
    const role = referenceRoleConfig(reference.role, index);
    return [
      `${referenceRoleToken(role.id)} / ${referenceToken(index)} / image ${index + 1}: ${name}.`,
      `Role: ${role.label}.`,
      `Sent to FLUX as ${imageField}.`,
      role.cue
    ].join(" ");
  });
  const parts = [
    referenceMap.length
      ? `Attached reference map:\n${referenceMap.join("\n")}`
      : "",
    referenceCue.trim(),
    referenceWeightCue(weight)
  ].filter(Boolean);
  return parts.join("\n");
}

export function clampBatchCount(value: number) {
  return Math.max(1, Math.min(300, Number.isFinite(value) ? Math.floor(value) : 1));
}

export function parseSeed(seed: string) {
  if (!seed.trim()) return null;
  const parsed = Number(seed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRunPlanPayload(options: {
  batchMode: BatchMode;
  batchCount: number;
  activeId: string;
  selectedPromptIds: string[];
  promptText: string;
  model: string;
  width: number;
  height: number;
  seed: string;
  promptUpsampling: boolean;
  referenceCue: string;
  referenceWeight: number;
  references: ReferenceImage[];
}) {
  const hasReferences = options.references.some((reference) => Boolean(reference.value));
  return {
    count: clampBatchCount(options.batchCount),
    parallel: 4,
    permutationSize: 2,
    model: options.model,
    width: options.width,
    height: options.height,
    seed: parseSeed(options.seed),
    prompt: options.batchMode === "current" ? options.promptText : undefined,
    promptId: options.activeId || undefined,
    startId: options.activeId || undefined,
    promptIds: options.batchMode === "permutations" ? options.selectedPromptIds : undefined,
    batchMode: options.batchMode,
    promptUpsampling: options.promptUpsampling,
    referenceCue: options.referenceCue,
    referenceWeight: clampReferenceWeight(options.referenceWeight),
    hasReferences,
    outputFormat: "png" as const
  };
}

export async function fetchRunPlan(payload: Record<string, unknown>) {
  const response = await fetch("/api/dashboard/run-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not build run plan");
  return data.requests as PlanRequestItem[];
}

export async function executePlannedGeneration(item: PlanRequestItem, apiKey: string, references: ReferenceImage[]) {
  const response = await fetch(item.endpoint, {
    method: item.method || "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...item.body,
      apiKey: apiKey.trim() || undefined,
      references: references.map((reference) => reference.value).filter(Boolean)
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Generation failed");
  return data;
}

export function buildAssetRecord(
  data: any,
  item: PlanRequestItem,
  references: ReferenceImage[]
): AssetRecord {
  const assetId = data.id || `${Date.now()}-${item.batchIndex}`;
  return {
    id: assetId,
    title: item.title,
    createdAt: new Date().toISOString(),
    timestamp: Date.now(),
    imageDataUrl: data.imageDataUrl,
    imageUrl: data.sampleUrl,
    image_url: data.sampleUrl,
    sampleUrl: data.sampleUrl,
    model: data.model,
    prompt: item.body.prompt,
    status: "complete",
    width: item.body.width,
    height: item.body.height,
    seed: item.body.seed ?? undefined,
    aspectRatio: `${item.body.width}:${item.body.height}`,
    provider: "bfl-api",
    payload: data.payload,
    references,
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
    assetKind: "output"
  };
}

export function buildCompleteRunLog(asset: AssetRecord, started: number, item: PlanRequestItem): RunLogEntry {
  return {
    id: asset.id,
    title: asset.title || asset.id,
    timestamp: asset.timestamp,
    model: asset.model,
    status: "complete",
    promptTokens: estimateTokens(asset.prompt),
    estimatedCredits: item.estimatedCredits,
    actualCredits: asset.costCredits,
    creditsBefore: asset.creditsBefore,
    creditsAfter: asset.creditsAfter,
    creditDelta: asset.creditDelta,
    durationMs: Date.now() - started,
    prompt: asset.prompt,
    width: asset.width,
    height: asset.height,
    batchIndex: item.batchIndex,
    batchTotal: item.batchTotal
  };
}

export function buildFailedRunLog(
  item: PlanRequestItem,
  started: number,
  model: string,
  message: string
): RunLogEntry {
  return {
    id: `failed-${Date.now()}-${item.batchIndex}`,
    title: item.title,
    timestamp: Date.now(),
    model,
    status: "failed",
    promptTokens: estimateTokens(item.body.prompt || ""),
    estimatedCredits: item.estimatedCredits,
    durationMs: Date.now() - started,
    error: message,
    prompt: item.body.prompt,
    width: item.body.width,
    height: item.body.height,
    batchIndex: item.batchIndex,
    batchTotal: item.batchTotal
  };
}

export function readReferenceFiles(files: File[]) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise<ReferenceImage>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ id: `${file.name}-${Date.now()}`, name: file.name, value: String(reader.result) });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}
