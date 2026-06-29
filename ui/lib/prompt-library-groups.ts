import { defaultComboSettings, type ComboSettings } from "./prompt-combo";
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
  alien_creatures: "Alien Creatures",
  audio_reactive_objects: "Product Objects",
  nonhuman_species: "Non-Human Species",
  theme_studies: "Theme Studies",
  custom_prompts: "Custom",
  audio_sequences: "Audio Sequences",
  gallery_prompts: "Gallery Prompts"
};

const LIBRARY_COMBO_PRESETS: Record<string, Partial<ComboSettings>> = {
  cybernetic_flowers: defaultComboSettings,
  alien_creatures: {
    mode: "morph",
    definition: "A single invented alien creature species",
    primaryLabel: "primary creature anatomy",
    secondaryLabel: "secondary creature anatomy",
    linkPhrase: "xenobiologically hybridized with",
    environment: "deep_ocean",
    environmentOptions: [
      {
        id: "jungle",
        name: "Jungle",
        description: "humid alien jungle canopy, wet black leaves, fungal mist, predatory bioluminescent undergrowth"
      },
      {
        id: "deep_ocean",
        name: "Deep Ocean",
        description: "abyssal deep ocean trench, blue-black water, drifting marine snow, pressure-lit bioluminescence"
      },
      {
        id: "antarctica",
        name: "Antarctica",
        description: "Antarctic ice shelf cavern, blue ice, frozen brine pools, pale polar light"
      },
      {
        id: "desert",
        name: "Desert",
        description: "wind-carved alien dune desert, mineral sand, heat haze, sandworm-scale burrows"
      },
      {
        id: "lab",
        name: "Lab",
        description: "sterile xenobiology laboratory tank, glass containment, cold instruments, clinical rim light"
      }
    ]
  }
};

export function promptLibraryId(record: PromptRecord) {
  return record.domain || "custom_prompts";
}

export function promptLibraryLabel(id: string) {
  return LIBRARY_LABELS[id] || id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function promptLibraryComboPreset(id: string) {
  return LIBRARY_COMBO_PRESETS[id] || null;
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
