import type { ReferenceImage, ReferenceRole } from "@/lib/types";

export type ReferenceRoleConfig = {
  id: ReferenceRole;
  label: string;
  shortLabel: string;
  hint: string;
  cue: string;
};

export type ReferenceDropTarget = {
  id: string;
  role: ReferenceRole;
  label: string;
  shortLabel: string;
  token: string;
  hint: string;
  emptyLabel: string;
};

export const referenceRoleOptions: ReferenceRoleConfig[] = [
  {
    id: "character",
    label: "Character",
    shortLabel: "Char",
    hint: "person, form",
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
    hint: "world",
    cue:
      "Use this image for environment, world logic, terrain, atmosphere, surrounding objects, and spatial mood. Let the main prompt control the subject action."
  },
  {
    id: "pose",
    label: "Pose",
    shortLabel: "Pose",
    hint: "portrait, camera",
    cue:
      "Use this image for pose, posture, camera angle, framing, gesture, and composition only. Preserve the requested character and style from the other references."
  },
  {
    id: "loose",
    label: "Image",
    shortLabel: "Image",
    hint: "extra ref",
    cue:
      "Use this image as a loose secondary cue for useful details, props, lighting accents, textures, or mood. Keep it subordinate to character, style, pose, and environment references."
  }
];

const referenceRoleById = new Map(referenceRoleOptions.map((option) => [option.id, option]));
const defaultRolesByIndex: ReferenceRole[] = ["character", "pose", "environment", "style", "style", "loose"];
export const referenceRoleTokenPattern = /@(char|character|style1|style2|style|env|environment|pose|img|image|extra|loose)\b/gi;

export const referenceDropTargets: ReferenceDropTarget[] = [
  { id: "character", role: "character", label: "Character", shortLabel: "Char", token: "@char", hint: "person, form", emptyLabel: "Add character" },
  { id: "pose", role: "pose", label: "Pose", shortLabel: "Pose", token: "@pose", hint: "portrait, camera", emptyLabel: "Add pose" },
  { id: "environment", role: "environment", label: "Environment", shortLabel: "Env", token: "@env", hint: "world", emptyLabel: "Add environment" },
  { id: "style-1", role: "style", label: "Style 1", shortLabel: "Style 1", token: "@style1", hint: "aesthetic 1", emptyLabel: "Add style 1" },
  { id: "style-2", role: "style", label: "Style 2", shortLabel: "Style 2", token: "@style2", hint: "aesthetic 2", emptyLabel: "Add style 2" },
  { id: "add-image", role: "loose", label: "Add Image", shortLabel: "Image", token: "@img", hint: "extra ref", emptyLabel: "Add image" }
];

const referenceDropTargetById = new Map(referenceDropTargets.map((target) => [target.id, target]));

export function referenceRoleForIndex(index: number): ReferenceRole {
  return defaultRolesByIndex[index] || "loose";
}

export function normalizeReferenceRole(role: unknown, index = 0): ReferenceRole {
  const normalized = typeof role === "string" ? role.toLowerCase() : "";
  if (normalized === "char") return "character";
  if (normalized === "env") return "environment";
  if (normalized === "style1" || normalized === "style2") return "style";
  if (normalized === "img" || normalized === "extra" || normalized === "image" || normalized === "ref") return "loose";
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
  const normalized = normalizeReferenceRole(role, index);
  if (normalized === "character") return "@char";
  if (normalized === "environment") return "@env";
  if (normalized === "loose") return "@img";
  return `@${normalized}`;
}

export function referenceTargetToken(reference: Pick<ReferenceImage, "targetId" | "role">, index = 0) {
  const target = reference.targetId ? referenceDropTargetById.get(reference.targetId) : null;
  return target?.token || referenceRoleToken(reference.role, index);
}

export function referenceDisplayName(reference: ReferenceImage, index: number) {
  return reference.name || `Reference ${index + 1}`;
}

export function referencePreviewSrc(reference: ReferenceImage) {
  return /^data:image\//i.test(reference.value) || /^https?:\/\//i.test(reference.value)
    ? reference.value
    : "";
}
