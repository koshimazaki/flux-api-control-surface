import { defaultComboSettings, type ComboSettings } from "./prompt-combo";
import { promptMediaType, promptVideoCategory, VIDEO_PROMPT_DOMAIN } from "./prompt-media";
import type { PromptRecord } from "./types";

export const ALL_PROMPT_LIBRARY_ID = "all";

/** Group kind: the PRD media menu, or a per-domain collection. */
export type PromptLibraryOptionKind = "all" | "media" | "domain";

export type PromptLibraryOption = {
  id: string;
  label: string;
  count: number;
  kind: PromptLibraryOptionKind;
};

/**
 * The PRD's Prompt Library menu. These groups read a record's media metadata,
 * so they coexist with the per-domain collections below rather than replacing
 * them: an alien-creature prompt is both "Image Prompts" and "Alien Creatures".
 */
export const PROMPT_MEDIA_GROUP_IDS = [
  "image_prompts",
  "video_simple",
  "video_detailed",
  "video_sequence",
  "video_dialogue_sound",
  "shared_prompts"
] as const;

export type PromptMediaGroupId = (typeof PROMPT_MEDIA_GROUP_IDS)[number];

const LIBRARY_LABELS: Record<string, string> = {
  all: "All Prompts",
  image_prompts: "Image Prompts",
  video_simple: "Video — Simple",
  video_detailed: "Video — Detailed",
  video_sequence: "Video — Beat / Sequence",
  video_dialogue_sound: "Video — Dialogue & Sound",
  shared_prompts: "Shared Prompts",
  audio_prompts: "Audio Prompts",
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

/** Which PRD media group a record belongs to. Legacy records land in Image Prompts. */
export function promptMediaGroupId(record: PromptRecord): PromptMediaGroupId | "audio_prompts" {
  const media = promptMediaType(record);
  if (media === "shared") return "shared_prompts";
  if (media === "audio") return "audio_prompts";
  if (media !== "video") return "image_prompts";
  switch (promptVideoCategory(record)) {
    case "detailed":
      return "video_detailed";
    case "sequence":
      return "video_sequence";
    case "dialogue_sound":
      return "video_dialogue_sound";
    default:
      return "video_simple";
  }
}

/** Video and shared records, which the Video Script picker offers first. */
export function isVideoLibraryPrompt(record: PromptRecord) {
  const media = promptMediaType(record);
  return media === "video" || media === "shared";
}

/**
 * One membership test for both group kinds, so the library filter does not have
 * to know whether the selected id is a media group or a domain.
 */
export function promptMatchesLibrary(record: PromptRecord, libraryId: string) {
  if (!libraryId || libraryId === ALL_PROMPT_LIBRARY_ID) return true;
  if (isPromptMediaGroupId(libraryId)) return promptMediaGroupId(record) === libraryId;
  return promptLibraryId(record) === libraryId;
}

export function isPromptMediaGroupId(id: string): id is PromptMediaGroupId {
  return (PROMPT_MEDIA_GROUP_IDS as readonly string[]).includes(id);
}

/** Group a saved record should reveal itself in: media group for video/shared. */
export function promptLibraryIdForRecord(record: PromptRecord) {
  const group = promptMediaGroupId(record);
  return isPromptMediaGroupId(group) && group !== "image_prompts" ? group : promptLibraryId(record);
}

export function promptLibraryLabel(id: string) {
  return LIBRARY_LABELS[id] || id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function promptLibraryComboPreset(id: string) {
  return LIBRARY_COMBO_PRESETS[id] || null;
}

/**
 * The full library menu: All, the six PRD media groups (always listed, so an
 * empty video category is still discoverable), then the per-domain collections
 * that already existed. The video domain is omitted because the video media
 * groups already cover it.
 */
export function buildPromptLibraryOptions(records: PromptRecord[]): PromptLibraryOption[] {
  const domainCounts = new Map<string, number>();
  const mediaCounts = new Map<string, number>();
  records.forEach((record) => {
    const domain = promptLibraryId(record);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    const media = promptMediaGroupId(record);
    mediaCounts.set(media, (mediaCounts.get(media) || 0) + 1);
  });

  return [
    { id: ALL_PROMPT_LIBRARY_ID, label: promptLibraryLabel(ALL_PROMPT_LIBRARY_ID), count: records.length, kind: "all" },
    ...PROMPT_MEDIA_GROUP_IDS.map((id) => ({
      id,
      label: promptLibraryLabel(id),
      count: mediaCounts.get(id) || 0,
      kind: "media" as const
    })),
    ...Array.from(domainCounts.entries())
      .filter(([id]) => id !== VIDEO_PROMPT_DOMAIN)
      .sort(([left], [right]) => promptLibraryLabel(left).localeCompare(promptLibraryLabel(right)))
      .map(([id, count]) => ({ id, label: promptLibraryLabel(id), count, kind: "domain" as const }))
  ];
}
