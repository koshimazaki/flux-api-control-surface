import { compactPrompt } from "./prompt-utils";
import type { PromptRecord } from "./types";

type SavePromptOptions = {
  saveAsNew?: boolean;
};

function savedSeed(seed: string, fallback?: number) {
  const parsed = Number(seed);
  return Number.isFinite(parsed) && seed.trim() ? parsed : fallback;
}

function promptSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 44);
}

export async function savePromptRecord(
  activePrompt: PromptRecord | undefined,
  promptText: string,
  seed: string,
  options: SavePromptOptions = {}
) {
  const baseId = activePrompt?.id || activePrompt?.species || "custom_prompt";
  const id = options.saveAsNew || !activePrompt?.id
    ? `${promptSlug(baseId) || "custom_prompt"}_${Date.now()}`
    : activePrompt.id;
  const record = {
    ...activePrompt,
    id,
    domain: activePrompt?.domain || "custom_prompts",
    species: activePrompt?.species || "custom",
    seed: savedSeed(seed, activePrompt?.seed),
    prompt_format: activePrompt?.prompt_format || "text",
    prompt: compactPrompt(promptText)
  };
  const response = await fetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not save prompt");
  return data.record as PromptRecord;
}

export async function deletePromptRecord(id: string) {
  const response = await fetch(`/api/prompts?id=${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Could not delete prompt");
  return data.id as string;
}

export function upsertPromptRecord(records: PromptRecord[], record: PromptRecord) {
  return [record, ...records.filter((item) => item.id !== record.id)];
}
