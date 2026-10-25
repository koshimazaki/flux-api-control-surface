import { describe, expect, it } from "vitest";
import {
  VIDEO_TOOL_TABS,
  defaultWorkspaceModeForMedia,
  isImageWorkspaceMode,
  videoToolTabForWorkspace,
  workspaceForVideoToolTab,
  workspaceMediaKindForMode,
  workspaceModesForMedia
} from "@/lib/workspace-media";

describe("workspace media navigation", () => {
  it("keeps every image tool in one ordered domain", () => {
    expect(workspaceModesForMedia("image")).toEqual([
      "flux3_image",
      "prompt",
      "erase",
      "outpaint",
      "deblur",
      "vto",
      "glyphs"
    ]);
  });

  it("keeps FLUX 3, Edit and Upscale in the video domain", () => {
    expect(workspaceModesForMedia("video")).toEqual(["flux3", "edit", "upscale"]);
    expect(workspaceMediaKindForMode("flux3")).toBe("video");
    expect(workspaceMediaKindForMode("edit")).toBe("video");
    expect(workspaceMediaKindForMode("upscale")).toBe("video");
  });

  it("uses predictable landing modes for either media switch", () => {
    expect(defaultWorkspaceModeForMedia("image")).toBe("prompt");
    expect(defaultWorkspaceModeForMedia("video")).toBe("flux3");
    expect(workspaceMediaKindForMode("glyphs")).toBe("image");
  });

  it("separates image tools that take a source asset from prompt and video workspaces", () => {
    expect(isImageWorkspaceMode("erase")).toBe(true);
    expect(isImageWorkspaceMode("vto")).toBe(true);
    expect(isImageWorkspaceMode("prompt")).toBe(false);
    expect(isImageWorkspaceMode("flux3")).toBe(false);
    expect(isImageWorkspaceMode("edit")).toBe(false);
    expect(isImageWorkspaceMode("upscale")).toBe(false);
  });

  it("gives the video rail one tab per tool, mirroring the image rail", () => {
    expect(VIDEO_TOOL_TABS).toEqual(["t2v", "i2v", "v2v", "edit", "upscale"]);
  });

  it("maps FLUX 3 source modes onto the one FLUX 3 workspace and back", () => {
    expect(workspaceForVideoToolTab("t2v")).toEqual({ workspaceMode: "flux3", flux3SourceMode: "t2v" });
    expect(workspaceForVideoToolTab("i2v")).toEqual({ workspaceMode: "flux3", flux3SourceMode: "i2v" });
    expect(workspaceForVideoToolTab("v2v")).toEqual({ workspaceMode: "flux3", flux3SourceMode: "v2v" });
    expect(workspaceForVideoToolTab("edit")).toEqual({ workspaceMode: "edit" });
    expect(workspaceForVideoToolTab("upscale")).toEqual({ workspaceMode: "upscale" });

    expect(videoToolTabForWorkspace("flux3", "v2v")).toBe("v2v");
    expect(videoToolTabForWorkspace("edit", "v2v")).toBe("edit");
    expect(videoToolTabForWorkspace("upscale", "t2v")).toBe("upscale");
  });
});
