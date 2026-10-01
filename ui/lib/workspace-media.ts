import { FLUX3_IMAGE_ENABLED } from "@/lib/feature-flags";
import { isFlux3SourceMode, type Flux3SourceMode } from "@/lib/flux3-video";
import type { ImageWorkspaceMode, SourceImageMode, WorkspaceMode } from "@/lib/types";

export type WorkspaceMediaKind = "image" | "video";

const IMAGE_TOOL_MODES: readonly WorkspaceMode[] = ["prompt", "erase", "outpaint", "deblur", "vto", "glyphs"];

/** FLUX 3 Image leads the image rail once its flag is on. */
export function imageWorkspaceModes(flux3Image = FLUX3_IMAGE_ENABLED): readonly WorkspaceMode[] {
  return flux3Image ? ["flux3_image", ...IMAGE_TOOL_MODES] : IMAGE_TOOL_MODES;
}

export const IMAGE_WORKSPACE_MODES = imageWorkspaceModes();

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

/** A tool on the shared image tool panel; FLUX 3 Image has its own workspace. */
export function isImageWorkspaceMode(mode: WorkspaceMode): mode is ImageWorkspaceMode {
  return mode !== "prompt" && mode !== "flux3_image" && workspaceMediaKindForMode(mode) === "image";
}

/** A mode that loads a source image: the image tools, and FLUX 3 Image's edits. */
export function isSourceImageMode(mode: WorkspaceMode): mode is SourceImageMode {
  return mode === "flux3_image" || isImageWorkspaceMode(mode);
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
