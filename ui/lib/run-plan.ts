import { estimateMinimumCost, estimateTokens } from "./pricing";
import {
  buildComboPrompt,
  chunk,
  combinations,
  comboIdFromPrompts,
  normalizeComboMode,
  normalizeComboSettings,
  type ComboMode,
  type ComboSettings
} from "./prompt-combo";
import { composeReferencePrompt } from "./prompt-utils";
import { getBflModel, maxReferencesForBflModel } from "./provider-registry";
import type { PromptRecord } from "./types";

export type RunPlanBody = {
  count?: number;
  parallel?: number;
  permutationSize?: number;
  model?: string;
  width?: number;
  height?: number;
  seed?: number | null;
  prompt?: string;
  promptId?: string;
  promptIds?: string[];
  startId?: string;
  batchMode?: "current" | "library" | "permutations";
  promptUpsampling?: boolean;
  referenceCue?: string;
  referenceWeight?: number;
  references?: string[];
  hasReferences?: boolean;
  outputFormat?: "jpeg" | "png" | "webp";
  comboMode?: ComboMode;
  comboSettings?: Partial<ComboSettings>;
};

function clampCount(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(300, count));
}

function clampParallel(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 4;
  return Math.max(1, Math.min(8, count));
}

function clampReferenceWeight(value: unknown) {
  const weight = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 80;
  return Math.max(0, Math.min(100, weight));
}

function normalizedReferences(value: unknown, maxReferences: number) {
  return Array.isArray(value)
    ? value
        .filter((reference): reference is string => typeof reference === "string" && Boolean(reference.trim()))
        .slice(0, maxReferences)
    : [];
}

function selectPrompts(prompts: PromptRecord[], body: RunPlanBody) {
  const count = clampCount(body.count);
  if (body.batchMode === "permutations" && body.promptIds?.length) {
    const ids = new Set(body.promptIds);
    const sources = prompts.filter((prompt) => ids.has(prompt.id));
    const size = Math.max(2, Math.min(4, body.permutationSize || 2));
    const comboSettings = normalizeComboSettings({ ...body.comboSettings, mode: body.comboMode });
    const comboMode = normalizeComboMode(body.comboMode ?? comboSettings.mode);
    return combinations(sources, size)
      .slice(0, count)
      .map((combo, index) => ({
        id: `${comboIdFromPrompts(combo, `perm_${comboMode}_${index + 1}`)}`,
        species: "permutation",
        seed: combo.find((record) => typeof record.seed === "number")?.seed,
        plant_form: combo.map((record) => record.plant_form).filter(Boolean).join(" + "),
        prompt: buildComboPrompt(combo, { mode: comboMode, settings: comboSettings })
      }));
  }
  if (body.promptIds?.length) {
    const ids = new Set(body.promptIds);
    return prompts.filter((prompt) => ids.has(prompt.id)).slice(0, count);
  }
  if (body.batchMode === "library") {
    const startIndex = Math.max(0, prompts.findIndex((prompt) => prompt.id === (body.startId || body.promptId)));
    const ordered = [...prompts.slice(startIndex), ...prompts.slice(0, startIndex)];
    return ordered.slice(0, count);
  }
  const promptRecord = body.prompt
    ? ({ id: body.promptId || "inline_prompt", seed: body.seed ?? undefined, prompt: body.prompt } as PromptRecord)
    : prompts.find((prompt) => prompt.id === body.promptId) ||
      ({ id: body.promptId || "inline_prompt", seed: body.seed ?? undefined, prompt: prompts[0]?.prompt || "" } as PromptRecord);
  return Array.from({ length: count }, (_, index) => ({
    ...promptRecord,
    id: count > 1 ? `${promptRecord.id}_${index + 1}` : promptRecord.id,
    seed:
      typeof body.seed === "number"
        ? body.seed + index
        : typeof promptRecord.seed === "number"
          ? promptRecord.seed + index
          : undefined
  }));
}

export function buildRunPlan(prompts: PromptRecord[], body: RunPlanBody) {
  const parallel = clampParallel(body.parallel);
  const model = body.model || "pro-preview";
  const modelConfig = getBflModel(model) || getBflModel("pro-preview");
  const maxReferences = modelConfig?.maxReferences ?? maxReferencesForBflModel(model);
  const width = body.width || 1024;
  const height = body.height || 1024;
  const outputFormat = body.outputFormat || "png";
  const promptUpsampling = Boolean(modelConfig?.supportsPromptUpsampling) && body.promptUpsampling !== false;
  const references = normalizedReferences(body.references, maxReferences);
  const hasReferences = Boolean(body.hasReferences || references.length);
  const cost = estimateMinimumCost(model, hasReferences);
  const selected = selectPrompts(prompts, body);

  const requests = selected.map((prompt, index) => {
    const promptText = composeReferencePrompt(prompt.prompt, body.referenceCue, hasReferences);
    return {
      title: prompt.id,
      endpoint: "/api/bfl/generate",
      method: "POST",
      body: {
        model,
        title: prompt.id,
        prompt: promptText,
        width,
        height,
        seed:
          typeof body.seed === "number"
            ? body.seed + index
            : typeof prompt.seed === "number"
              ? prompt.seed
              : null,
        outputFormat,
        promptUpsampling,
        referenceWeight: clampReferenceWeight(body.referenceWeight),
        references
      },
      batchIndex: index + 1,
      batchTotal: selected.length,
      promptTokens: estimateTokens(promptText),
      estimatedCredits: cost.credits,
      estimatedUsd: cost.usd
    };
  });

  const groups = chunk(requests, parallel);
  return {
    dashboard: "FLUX API Control Surface",
    count: requests.length,
    parallel,
    estimatedCredits: requests.reduce((sum, item) => sum + item.estimatedCredits, 0),
    estimatedUsd: requests.reduce((sum, item) => sum + item.estimatedUsd, 0),
    requests,
    parallelGroups: groups.map((items, index) => ({ group: index + 1, count: items.length, requests: items })),
    nativeFluxMcpHandoff: {
      serverUrl: "https://mcp.bfl.ai",
      tool: "generate_image",
      maxParallelHint: 8,
      maxReferences,
      groups: groups.map((items, index) => ({
        group: index + 1,
        prompts: items.map((item) => item.body),
        dashboardRequests: items.map((item) => ({
          endpoint: item.endpoint,
          method: item.method,
          body: item.body
        }))
      }))
    }
  };
}
