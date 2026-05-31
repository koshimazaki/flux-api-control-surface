import { estimateMinimumCost, estimateTokens } from "./pricing";
import { buildComboPrompt, chunk, combinations, comboIdFromPrompts } from "./prompt-combo";
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
  hasReferences?: boolean;
  outputFormat?: "jpeg" | "png" | "webp";
};

function compactPrompt(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

function clampCount(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(300, count));
}

function clampParallel(value: unknown) {
  const count = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 4;
  return Math.max(1, Math.min(8, count));
}

function applyReferenceCue(prompt: string, referenceCue?: string, hasReferences?: boolean) {
  if (!hasReferences) return compactPrompt(prompt);
  return `${compactPrompt(prompt)}\n\nReference roles: ${referenceCue || "Use supplied images as visual references while preserving the prompt subject."}`;
}

function clampReferenceWeight(value: unknown) {
  const weight = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 80;
  return Math.max(0, Math.min(100, weight));
}

function selectPrompts(prompts: PromptRecord[], body: RunPlanBody) {
  const count = clampCount(body.count);
  if (body.batchMode === "permutations" && body.promptIds?.length) {
    const ids = new Set(body.promptIds);
    const sources = prompts.filter((prompt) => ids.has(prompt.id));
    const size = Math.max(2, Math.min(4, body.permutationSize || 2));
    return combinations(sources, size)
      .slice(0, count)
      .map((combo, index) => ({
        id: `${comboIdFromPrompts(combo, `perm_${index + 1}`)}`,
        species: "permutation",
        seed: combo.find((record) => typeof record.seed === "number")?.seed,
        plant_form: combo.map((record) => record.plant_form).filter(Boolean).join(" + "),
        prompt: buildComboPrompt(combo)
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
  const width = body.width || 1024;
  const height = body.height || 1024;
  const outputFormat = body.outputFormat || "png";
  const promptUpsampling = !model.includes("klein") && body.promptUpsampling !== false;
  const cost = estimateMinimumCost(model, Boolean(body.hasReferences));
  const selected = selectPrompts(prompts, body);

  const requests = selected.map((prompt, index) => {
    const promptText = applyReferenceCue(prompt.prompt, body.referenceCue, body.hasReferences);
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
        seed: typeof prompt.seed === "number" ? prompt.seed : null,
        outputFormat,
        promptUpsampling,
        referenceWeight: clampReferenceWeight(body.referenceWeight),
        references: []
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
    dashboard: "BFL API Dashboard",
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
