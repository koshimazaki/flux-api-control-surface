import type { PromptRecord } from "./types";

export const ALL_PROMPT_LIBRARY_ID = "all";

export type PromptLibraryOption = {
  id: string;
  label: string;
  count: number;
};

const LIBRARY_LABELS: Record<string, string> = {
  all: "All Prompts",
  cybernetic_flowers: "Cyber Flowers",
  audio_reactive_objects: "Product Objects",
  nonhuman_species: "Non-Human Species",
  theme_studies: "Theme Studies",
  custom_prompts: "Custom"
};

export function promptLibraryId(record: PromptRecord) {
  return record.domain || "custom_prompts";
}

export function promptLibraryLabel(id: string) {
  return LIBRARY_LABELS[id] || id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function buildPromptLibraryOptions(records: PromptRecord[]): PromptLibraryOption[] {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const id = promptLibraryId(record);
    counts.set(id, (counts.get(id) || 0) + 1);
  });

  return [
    { id: ALL_PROMPT_LIBRARY_ID, label: promptLibraryLabel(ALL_PROMPT_LIBRARY_ID), count: records.length },
    ...Array.from(counts.entries())
      .sort(([left], [right]) => promptLibraryLabel(left).localeCompare(promptLibraryLabel(right)))
      .map(([id, count]) => ({ id, label: promptLibraryLabel(id), count }))
  ];
}
