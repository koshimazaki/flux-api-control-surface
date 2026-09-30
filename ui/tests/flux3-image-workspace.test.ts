import { describe, expect, it } from "vitest";
import { normalizeFlux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import { normalizeToolWorkspaceCache } from "@/lib/dashboard/workspace-cache";
import type { Flux3ImageBox } from "@/lib/flux3-image";
import { imageWorkspaceModes, workspaceModesForMedia } from "@/lib/workspace-media";

const box = (patch: Partial<Flux3ImageBox> = {}): Flux3ImageBox => ({
  id: "box-a",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  fuzz: 8,
  prompt: "make the scarf red",
  ...patch
});

describe("FLUX 3 Image workspace state", () => {
  it("reads a stored draft defensively", () => {
    const draft = normalizeFlux3ImageDraft({
      mode: "precise",
      selection: "pixels",
      pixelTool: "lasso",
      prompts: { t2i: "fox", edit: 4 },
      boxes: [box(), { id: "bad", x: -1, y: 0, width: 5, height: 5 }, "junk"],
      boxSourceId: "asset-1"
    });
    expect(draft).toMatchObject({ mode: "precise", selection: "pixels", pixelTool: "lasso", boxSourceId: "asset-1" });
    expect(draft.prompts).toEqual({ t2i: "fox", edit: "", pixels: "" });
    expect(draft.boxes).toEqual([box()]);
    expect(normalizeFlux3ImageDraft("nope").mode).toBe("t2i");
  });

  it("leads the image rail only when the flag is on", () => {
    expect(imageWorkspaceModes(true)[0]).toBe("flux3_image");
    expect(imageWorkspaceModes(false)).not.toContain("flux3_image");
    // The suite runs with the flag off, as a fresh checkout does.
    expect(workspaceModesForMedia("image")).not.toContain("flux3_image");
    expect(normalizeToolWorkspaceCache({ workspaceMode: "flux3_image" }).workspaceMode).toBe("prompt");
  });
});
