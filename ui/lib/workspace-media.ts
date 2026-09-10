import { isFlux3SourceMode, type Flux3SourceMode } from "@/lib/flux3-video";
import type { ImageWorkspaceMode, WorkspaceMode } from "@/lib/types";

export type WorkspaceMediaKind = "image" | "video";

export const IMAGE_WORKSPACE_MODES: readonly WorkspaceMode[] = [
  "prompt",
  "erase",
  "outpaint",
  "deblur",
  "vto",
  "glyphs"
];

/** Workspaces mounted in the Video domain. FLUX 3 hosts three source modes behind one workspace. */
export const VIDEO_WORKSPACE_MODES: readonly WorkspaceMode[] = ["flux3", "edit", "upscale"];

/**
 * The Video tool rail mirrors the Image rail: one tab per tool. FLUX 3's
 * Text / Frames / Continue share one endpoint, one set of controls and one
 * saved-result list, so they map onto the FLUX 3 workspace plus its source
 * mode rather than onto three workspaces.
 */
export type VideoToolTab = Flux3SourceMode | "edit" | "upscale";

export const VIDEO_TOOL_TABS: readonly VideoToolTab[] = ["t2v", "i2v", "v2v", "edit", "upscale"];

export function workspaceMediaKindForMode(mode: WorkspaceMode): WorkspaceMediaKind {
  return VIDEO_WORKSPACE_MODES.includes(mode) ? "video" : "image";
}

export function isImageWorkspaceMode(mode: WorkspaceMode): mode is ImageWorkspaceMode {
  return mode !== "prompt" && workspaceMediaKindForMode(mode) === "image";
}

export function defaultWorkspaceModeForMedia(kind: WorkspaceMediaKind): WorkspaceMode {
  return kind === "video" ? "flux3" : "prompt";
}

export function workspaceModesForMedia(kind: WorkspaceMediaKind) {
  return kind === "video" ? VIDEO_WORKSPACE_MODES : IMAGE_WORKSPACE_MODES;
}

export function videoToolTabForWorkspace(mode: WorkspaceMode, flux3SourceMode: Flux3SourceMode): VideoToolTab {
  if (mode === "edit" || mode === "upscale") return mode;
  return flux3SourceMode;
}

export function workspaceForVideoToolTab(tab: VideoToolTab): { workspaceMode: WorkspaceMode; flux3SourceMode?: Flux3SourceMode } {
  return isFlux3SourceMode(tab) ? { workspaceMode: "flux3", flux3SourceMode: tab } : { workspaceMode: tab };
}
