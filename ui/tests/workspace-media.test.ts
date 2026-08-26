import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceModeForMedia,
  workspaceMediaKindForMode,
  workspaceModesForMedia
} from "@/lib/workspace-media";

describe("workspace media navigation", () => {
  it("keeps every image tool in one ordered domain", () => {
    expect(workspaceModesForMedia("image")).toEqual([
      "prompt",
      "erase",
      "outpaint",
      "deblur",
      "vto",
      "glyphs"
    ]);
  });

  it("keeps FLUX 3 and Upscale in the video domain", () => {
    expect(workspaceModesForMedia("video")).toEqual(["flux3", "upscale"]);
    expect(workspaceMediaKindForMode("flux3")).toBe("video");
    expect(workspaceMediaKindForMode("upscale")).toBe("video");
  });

  it("uses predictable landing modes for either media switch", () => {
    expect(defaultWorkspaceModeForMedia("image")).toBe("prompt");
    expect(defaultWorkspaceModeForMedia("video")).toBe("flux3");
    expect(workspaceMediaKindForMode("glyphs")).toBe("image");
  });
});
