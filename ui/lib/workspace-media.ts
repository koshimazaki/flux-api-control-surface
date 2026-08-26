import type { WorkspaceMode } from "@/lib/types";

export type WorkspaceMediaKind = "image" | "video";

export const IMAGE_WORKSPACE_MODES: readonly WorkspaceMode[] = [
  "prompt",
  "erase",
  "outpaint",
  "deblur",
  "vto",
  "glyphs"
];

export const VIDEO_WORKSPACE_MODES: readonly WorkspaceMode[] = ["flux3", "upscale"];

export function workspaceMediaKindForMode(mode: WorkspaceMode): WorkspaceMediaKind {
  return VIDEO_WORKSPACE_MODES.includes(mode) ? "video" : "image";
}

export function defaultWorkspaceModeForMedia(kind: WorkspaceMediaKind): WorkspaceMode {
  return kind === "video" ? "flux3" : "prompt";
}

export function workspaceModesForMedia(kind: WorkspaceMediaKind) {
  return kind === "video" ? VIDEO_WORKSPACE_MODES : IMAGE_WORKSPACE_MODES;
}
