import {
  Eraser,
  Film,
  Fingerprint,
  Focus,
  FolderOpen,
  ImagePlus,
  Maximize2,
  Music,
  Shirt,
  Send
} from "lucide-react";
import type { AssetBadge, WorkspaceMode } from "@/lib/types";

const badgeIcons = {
  audio: Music,
  reference: ImagePlus,
  prompt: Send,
  collection: FolderOpen,
  erase: Eraser,
  vto: Shirt,
  outpaint: Maximize2,
  deblur: Focus,
  flux3: Film,
  glyphs: Fingerprint
};

const rolePriority: AssetBadge["kind"][] = [
  "vto",
  "outpaint",
  "deblur",
  "erase",
  "flux3",
  "glyphs",
  "collection",
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
  if (mode === "flux3") return "FLUX.3";
  if (mode === "vto") return "VTO";
  if (mode === "outpaint") return "Outpaint";
  if (mode === "deblur") return "Deblur";
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
