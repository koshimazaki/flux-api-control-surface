import type { ReferenceImage, ReferenceRole } from "@/lib/types";

export type ReferenceRoleConfig = {
  id: ReferenceRole;
  label: string;
  shortLabel: string;
  hint: string;
  cue: string;
};

export const referenceRoleOptions: ReferenceRoleConfig[] = [
  {
    id: "character",
    label: "Character",
    shortLabel: "Char",
    hint: "identity, costume, materials",
    cue:
      "Use this image for the character identity, silhouette, costume, body language, and material design. Do not copy its background unless the prompt asks for it."
  },
  {
    id: "style",
    label: "Style",
    shortLabel: "Style",
    hint: "aesthetic, render, lighting",
    cue:
      "Use this image for aesthetic language, rendering style, lighting, palette, finish, and image texture. Do not copy its subject identity or scene layout."
  },
  {
    id: "environment",
    label: "Environment",
    shortLabel: "Env",
    hint: "world, biome, atmosphere",
    cue:
      "Use this image for environment, world logic, terrain, atmosphere, surrounding objects, and spatial mood. Let the main prompt control the subject action."
  },
  {
    id: "pose",
    label: "Pose",
    shortLabel: "Pose",
    hint: "posture, camera, composition",
    cue:
      "Use this image for pose, posture, camera angle, framing, gesture, and composition only. Preserve the requested character and style from the other references."
  },
  {
    id: "loose",
    label: "Loose",
    shortLabel: "Loose",
    hint: "optional secondary cue",
    cue:
      "Use this image as a loose secondary cue for useful details, props, lighting accents, textures, or mood. Keep it subordinate to character, style, pose, and environment references."
  }
];

const referenceRoleById = new Map(referenceRoleOptions.map((option) => [option.id, option]));
const defaultRolesByIndex: ReferenceRole[] = ["character", "style", "environment", "pose"];
export const referenceRoleTokenPattern = /@(character|style|environment|pose|loose)\b/gi;

export function referenceRoleForIndex(index: number): ReferenceRole {
  return defaultRolesByIndex[index] || "loose";
}

export function normalizeReferenceRole(role: unknown, index = 0): ReferenceRole {
  const normalized = typeof role === "string" ? role.toLowerCase() : "";
  return referenceRoleById.has(normalized as ReferenceRole)
    ? (normalized as ReferenceRole)
    : referenceRoleForIndex(index);
}

export function referenceRoleConfig(role: unknown, index = 0): ReferenceRoleConfig {
  return referenceRoleById.get(normalizeReferenceRole(role, index)) || referenceRoleOptions[0];
}

export function referenceToken(index: number) {
  return `@img${index + 1}`;
}

export function referenceRoleToken(role: unknown, index = 0) {
  return `@${normalizeReferenceRole(role, index)}`;
}

export function referenceDisplayName(reference: ReferenceImage, index: number) {
  return reference.name || `Reference ${index + 1}`;
}

export function referencePreviewSrc(reference: ReferenceImage) {
  return /^data:image\//i.test(reference.value) || /^https?:\/\//i.test(reference.value)
    ? reference.value
    : "";
}
