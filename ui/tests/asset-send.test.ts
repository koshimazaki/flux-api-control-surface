import { describe, expect, it } from "vitest";
import { SEND_INLINE_LIMIT, isSendFamily, sendActionCount, sendRowsFor } from "@/lib/asset-send";

const families = (rows: ReturnType<typeof sendRowsFor>) => rows.map((row) => row.family);
const actions = (rows: ReturnType<typeof sendRowsFor>, index = 0) => rows[index].groups.flatMap((group) => group.actions);

describe("where a gallery asset can be sent", () => {
  it("leads an image card with FLUX 3: the video keyframe, then the three FLUX 3 Image targets", () => {
    const rows = sendRowsFor(false, "flux3");
    expect(families(rows)).toEqual(["flux3", "flux2", "tools"]);
    expect(rows[0].groups.map((group) => group.caption)).toEqual(["Video", "Image"]);
    expect(actions(rows)).toEqual(["flux3-keyframe", "flux3-image-source", "flux3-image-reference", "flux3-image-box"]);
  });

  it("puts the preferred family first and keeps the others behind it in their usual order", () => {
    const rows = sendRowsFor(false, "tools");
    expect(families(rows)).toEqual(["tools", "flux3", "flux2"]);
    expect(actions(rows)).toEqual(["erase", "vto-person", "vto-garment", "outpaint", "deblur", "glyphs"]);
  });

  it("gives a video its FLUX 3 and tool rows, falling back to FLUX 3 when FLUX.2 is preferred", () => {
    const rows = sendRowsFor(true, "flux2");
    expect(families(rows)).toEqual(["flux3", "tools"]);
    expect(actions(rows)).toEqual(["flux3-video-prompt", "flux3-continue"]);
    expect(actions(rows, 1)).toEqual(["video-edit", "video-upscale"]);
  });

  it("counts a video's four buttons as few enough for one line, and an image's as too many", () => {
    expect(sendActionCount(sendRowsFor(true, "flux3"))).toBe(4);
    expect(sendActionCount(sendRowsFor(true, "flux3"))).toBeLessThanOrEqual(SEND_INLINE_LIMIT);
    expect(sendActionCount(sendRowsFor(false, "flux3"))).toBe(12);
  });

  it("drops actions the page cannot perform, and a family left with none", () => {
    const rows = sendRowsFor(true, "flux3", (action) => action === "flux3-video-prompt");
    expect(families(rows)).toEqual(["flux3"]);
    expect(actions(rows)).toEqual(["flux3-video-prompt"]);
    expect(sendRowsFor(true, "flux3", () => false)).toEqual([]);
  });

  it("reads a stored preference defensively", () => {
    expect(isSendFamily("tools")).toBe(true);
    expect(isSendFamily("flux1")).toBe(false);
    expect(isSendFamily(null)).toBe(false);
  });
});
