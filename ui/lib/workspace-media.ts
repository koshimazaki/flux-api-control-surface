import { FLUX3_IMAGE_ENABLED } from "@/lib/feature-flags";
import type { WorkspaceMode } from "@/lib/types";

export type WorkspaceMediaKind = "image" | "video";

const IMAGE_TOOL_MODES: readonly WorkspaceMode[] = ["prompt", "erase", "outpaint", "deblur", "vto", "glyphs"];

/** FLUX 3 Image leads the image rail once its flag is on. */
export function imageWorkspaceModes(flux3Image = FLUX3_IMAGE_ENABLED): readonly WorkspaceMode[] {
  return flux3Image ? ["flux3_image", ...IMAGE_TOOL_MODES] : IMAGE_TOOL_MODES;
}

export const IMAGE_WORKSPACE_MODES = imageWorkspaceModes();

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
