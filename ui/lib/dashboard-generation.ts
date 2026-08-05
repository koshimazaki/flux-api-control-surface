import { composeReferencePrompt } from "./prompt-utils";
import { estimateTokens } from "./pricing";
import type { ComboMode, ComboSettings } from "./prompt-combo";
import {
  normalizeReferenceRole,
  referenceDisplayName,
  referenceRoleConfig,
  referenceRoleTokenPattern,
  referenceTargetToken,
  referenceToken
} from "./reference-roles";
import type { BatchMode, ReferenceImage, ReferenceRole, RunLogEntry } from "./types";

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
  return composeReferencePrompt(baseText, referenceCue, references.some((reference) => Boolean(reference.value)));
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
  // Role validation is semantic, not slot-specific: @style1 and @style2 both
  // normalize to style here, while numbered @img tokens cover exact slot checks.
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

export function buildReferenceCue(referenceCue: string, weight: number, references: ReferenceImage[]) {
  const activeReferences = references.filter((reference) => Boolean(reference.value));
  const referenceMap = activeReferences.map((reference, index) => {
    const imageField = index === 0 ? "input_image" : `input_image_${index + 1}`;
    const name = referenceDisplayName(reference, index);
    const role = referenceRoleConfig(reference.role, index);
    return [
      `${referenceTargetToken(reference, index)} / ${referenceToken(index)} / image ${index + 1}: ${name}.`,
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
  normalizeReferences: boolean;
  referenceCue: string;
  referenceWeight: number;
  references: ReferenceImage[];
  comboMode: ComboMode;
  comboSettings: ComboSettings;
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
    normalizeReferences: options.normalizeReferences,
    referenceCue: options.referenceCue,
    referenceWeight: clampReferenceWeight(options.referenceWeight),
    hasReferences,
    outputFormat: "png" as const,
    comboMode: options.comboMode,
    comboSettings: options.comboSettings
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

export type SettledQueueJob = {
  id: string;
  title: string;
  model?: string;
  status: string;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  promptTokens?: number;
  estimatedCredits?: number;
  actualCredits?: number;
  creditsBefore?: number;
  creditsAfter?: number;
  error?: string;
  batchIndex?: number;
  batchTotal?: number;
};

/** Projects one settled server-queue job into the browser-session run log. */
export function queueJobRunLogEntry(job: SettledQueueJob): RunLogEntry {
  const creditDelta =
    typeof job.creditsBefore === "number" && typeof job.creditsAfter === "number"
      ? job.creditsBefore - job.creditsAfter
      : null;
  return {
    id: job.id,
    title: job.title || job.id,
    timestamp: job.finishedAt || Date.now(),
    model: job.model || "bfl-api",
    status: job.status === "complete" ? "complete" : "failed",
    promptTokens: job.promptTokens ?? 0,
    estimatedCredits: job.estimatedCredits ?? 0,
    actualCredits: job.actualCredits ?? null,
    creditsBefore: job.creditsBefore ?? null,
    creditsAfter: job.creditsAfter ?? null,
    creditDelta,
    durationMs: job.finishedAt && job.startedAt ? job.finishedAt - job.startedAt : undefined,
    error: job.status === "complete" ? undefined : job.error,
    batchIndex: job.batchIndex,
    batchTotal: job.batchTotal
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
