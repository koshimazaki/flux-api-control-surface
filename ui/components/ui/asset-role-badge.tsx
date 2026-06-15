import {
  Eraser,
  Fingerprint,
  ImagePlus,
  Maximize2,
  Music,
  Paintbrush,
  Send
} from "lucide-react";
import type { AssetBadge, WorkspaceMode } from "@/lib/types";

const badgeIcons = {
  audio: Music,
  reference: ImagePlus,
  prompt: Send,
  erase: Eraser,
  inpaint: Paintbrush,
  outpaint: Maximize2,
  glyphs: Fingerprint
};

const rolePriority: AssetBadge["kind"][] = [
  "inpaint",
  "outpaint",
  "erase",
  "glyphs",
  "reference",
  "prompt",
  "audio"
];

function iconKey(kind: AssetBadge["kind"]) {
  return kind === "prompt" ? "prompt" : kind;
}

export function assetRoleClassName(badges: AssetBadge[]) {
  const active = rolePriority.find((kind) => badges.some((badge) => badge.kind === kind));
  return active ? `assetRole-${active}` : "";
}

export function workspaceRoleLabel(mode: Exclude<WorkspaceMode, "prompt">) {
  if (mode === "inpaint") return "Inpaint";
  if (mode === "outpaint") return "Outpaint";
  if (mode === "erase") return "Erase";
  return "Glyphs";
}

export function AssetRoleBadge({ badge }: { badge: AssetBadge }) {
  const Icon = badgeIcons[iconKey(badge.kind)];
  return (
    <span className={`assetBadge assetBadge-${badge.kind}`} title={badge.title || badge.label}>
      <Icon size={11} />
      {badge.label}
    </span>
  );
}
