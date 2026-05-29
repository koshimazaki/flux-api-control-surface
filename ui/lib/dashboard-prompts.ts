import { compactPrompt } from "./prompt-utils";
import type { PromptRecord } from "./types";

function savedSeed(seed: string, fallback?: number) {
  const parsed = Number(seed);
  return Number.isFinite(parsed) && seed.trim() ? parsed : fallback;
}

export async function savePromptRecord(activePrompt: PromptRecord | undefined, promptText: string, seed: string) {
  const id = activePrompt?.id || `custom_prompt_${Date.now()}`;
  const record = {
    ...activePrompt,
    id,
    species: activePrompt?.species || "custom",
    seed: savedSeed(seed, activePrompt?.seed),
    prompt_format: "json",
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

export function upsertPromptRecord(records: PromptRecord[], record: PromptRecord) {
  return [record, ...records.filter((item) => item.id !== record.id)];
}
