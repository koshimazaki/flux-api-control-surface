import { describe, expect, it } from "vitest";
import {
  boxIds,
  boxesBlocker,
  composeEditPrompt,
  composeLayoutPrompt,
  editImages,
  editRows,
  isSmallBox,
  layoutFrameSize,
  layoutRows,
  moveWords,
  normalizeBoxRegion,
  normalizeRequestBoxes,
  placeWords,
  rescaleBoxes,
  toGrid,
  type Flux3ImageRequestRegion
} from "@/lib/flux3-image-boxes";

const frame = { width: 1360, height: 768 };
const box = (patch: Partial<Flux3ImageRequestRegion> = {}): Flux3ImageRequestRegion => ({
  id: "box-1",
  x: 680,
  y: 77,
  width: 340,
  height: 384,
  action: "change",
  prompt: "a pink tiger",
  ...patch
});

/** The trailing JSON rows of a composed prompt. */
const rowsOf = (prompt: string) => JSON.parse(prompt.slice(prompt.lastIndexOf(" [") + 1));

describe("BFL's 0–1000 grid", () => {
  it("converts pixels to [top, left, bottom, right] exactly as the docs' to_bbox does", () => {
    // to_bbox(left, top, right, bottom, width, height) from the bounding-box guide.
    const toBbox = (left: number, top: number, right: number, bottom: number, width: number, height: number) => [
      Math.round((top / height) * 1000),
      Math.round((left / width) * 1000),
      Math.round((bottom / height) * 1000),
      Math.round((right / width) * 1000)
    ];
    expect(toGrid(box(), frame)).toEqual(toBbox(680, 77, 1020, 461, 1360, 768));
    expect(toGrid({ x: 0, y: 0, width: 1360, height: 768 }, frame)).toEqual([0, 0, 1000, 1000]);
    // Each axis scales on its own, and nothing leaves the grid.
    expect(toGrid({ x: -10, y: 700, width: 1500, height: 200 }, frame)).toEqual([911, 0, 1000, 1000]);
  });

  it("flags a box that comes out near 40 × 25 output pixels, which depends on the resolution", () => {
    // 41 × 23 of 1360 × 768 is about 40 × 22 px at 1k, but about 160 × 90 px at 4k.
    expect(isSmallBox({ x: 0, y: 0, width: 41, height: 23 }, frame)).toBe(true);
    expect(isSmallBox({ x: 0, y: 0, width: 41, height: 23 }, frame, "4k")).toBe(false);
    expect(isSmallBox({ x: 0, y: 0, width: 120, height: 80 }, frame, "768sq")).toBe(false);
    // A long thin line of text is not small.
    expect(isSmallBox({ x: 0, y: 0, width: 900, height: 18 }, frame)).toBe(false);
  });

  it("says where a box is and which way a move goes, as the caption should", () => {
    expect(placeWords([0, 0, 1000, 1000])).toBe("across the whole frame");
    expect(placeWords([50, 40, 250, 300])).toBe("at the top left");
    expect(placeWords([400, 700, 600, 950])).toBe("on the right");
    expect(placeWords([700, 400, 950, 600])).toBe("at the bottom");
    expect(placeWords([400, 400, 600, 600])).toBe("in the center");
    expect(moveWords([500, 500, 700, 700], [200, 100, 400, 300])).toBe("up and to the left");
    expect(moveWords([500, 500, 700, 700], [520, 700, 720, 900])).toBe("to the right");
    expect(moveWords([500, 500, 700, 700], [480, 480, 740, 740])).toBe("to its marked place");
  });
});

describe("edit rows", () => {
  it("names boxes in lowercase with a number, unique per name", () => {
    expect(boxIds([{ prompt: "Make the red scarf blue" }, { prompt: "" }, { prompt: "red scarf" }, { prompt: "" }])).toEqual([
      "red_scarf_1",
      "area_1",
      "red_scarf_2",
      "area_2"
    ]);
  });

  it("writes every documented row type with all five fields", () => {
    const source = "SOURCE";
    const regions = [
      box({ id: "a", prompt: "a pink tiger" }),
      box({ id: "b", action: "keep", prompt: "the fallen log", x: 0, y: 384, width: 1360, height: 384 }),
      box({ id: "c", action: "move", prompt: "the knight", target: { x: 100, y: 100, width: 340, height: 384 } }),
      box({ id: "d", action: "remove", prompt: "the cat" }),
      box({ id: "e", prompt: "a ceramic lamp", reference: "LAMP" })
    ];
    const images = editImages(source, regions);
    expect(images).toEqual(["SOURCE", "LAMP"]);
    const rows = editRows(regions, frame, images);
    expect(rows.map((row) => Object.keys(row))).toEqual(Array(5).fill(["id", "from", "src_bbox", "tgt_bbox", "desc"]));
    expect(rows[0]).toMatchObject({ from: null, src_bbox: null, tgt_bbox: [100, 500, 600, 750] });
    expect(rows[1]).toMatchObject({ from: "ref_image_0", src_bbox: [500, 0, 1000, 1000], tgt_bbox: [500, 0, 1000, 1000] });
    expect(rows[2]).toMatchObject({ from: "ref_image_0", src_bbox: [100, 500, 600, 750], tgt_bbox: [130, 74, 630, 324] });
    expect(rows[3]).toMatchObject({ from: "ref_image_0", src_bbox: [100, 500, 600, 750], tgt_bbox: null });
    expect(rows[4]).toMatchObject({ from: "ref_image_1", src_bbox: [0, 0, 1000, 1000], tgt_bbox: [100, 500, 600, 750] });
  });

  it("composes a caption that names <ref_image_0> and every box, then ends with the rows", () => {
    const regions = [
      box({ prompt: "Make the tiger pink." }),
      box({ id: "k", action: "keep", prompt: "the snow" }),
      box({ id: "r", action: "remove", prompt: "" })
    ];
    const prompt = composeEditPrompt("Keep the colours natural", regions, frame, ["SOURCE"]);
    const rows = rowsOf(prompt);
    expect(prompt.startsWith("Keep the colours natural. In <ref_image_0>, make the tiger pink <tiger_pink_1> in the center; remove the marked element <area_1> in the center.")).toBe(true);
    expect(prompt).toContain("Keep the snow <snow_1> exactly unchanged.");
    expect(rows.map((row: { id: string }) => row.id)).toEqual(["tiger_pink_1", "snow_1", "area_1"]);
    for (const row of rows) expect(prompt).toContain(`<${row.id}>`);
  });

  it("phrases a bare description as a placement and a move by its direction", () => {
    const regions = [
      box({ prompt: "a glossy blue bowling ball" }),
      box({ id: "m", action: "move", prompt: "the knight", target: { x: 100, y: 100, width: 340, height: 384 } })
    ];
    const prompt = composeEditPrompt(undefined, regions, frame, ["SOURCE"]);
    expect(prompt).toContain("In <ref_image_0>, place a glossy blue bowling ball <glossy_blue_1> in the center; move the knight <knight_1> to the left.");
  });
});

describe("layout rows", () => {
  it("places each element on the frame and names unmentioned ones in the caption", () => {
    const square = layoutFrameSize("1:1");
    const regions = [
      box({ x: 0, y: 0, width: 1000, height: 1000, prompt: "a flat chartreuse field" }),
      box({ x: 150, y: 150, width: 700, height: 700, prompt: "a running silhouette" })
    ];
    expect(layoutRows(regions, square)).toEqual([
      { id: "flat_chartreuse_1", bbox: [0, 0, 1000, 1000], desc: "a flat chartreuse field" },
      { id: "running_silhouette_1", bbox: [150, 150, 850, 850], desc: "a running silhouette" }
    ]);
    const prompt = composeLayoutPrompt("A risograph poster of a runner <running_silhouette_1>", regions, square);
    expect(prompt).toContain("With a flat chartreuse field <flat_chartreuse_1> across the whole frame.");
    expect(prompt.match(/<running_silhouette_1>/g)).toHaveLength(1);
    expect(rowsOf(prompt)).toHaveLength(2);
  });

  it("sizes the layout frame from the aspect ratio, square for auto, and keeps boxes in place when it changes", () => {
    expect(layoutFrameSize("16:9")).toEqual({ width: 1000, height: 563 });
    expect(layoutFrameSize("auto")).toEqual({ width: 1000, height: 1000 });
    const [moved] = rescaleBoxes([{ ...box({ x: 100, y: 500, width: 200, height: 100 }), referenceId: null }], { width: 1000, height: 1000 }, { width: 1000, height: 500 });
    expect(moved).toMatchObject({ x: 100, y: 250, width: 200, height: 50 });
  });
});

describe("box validation and storage", () => {
  it("asks for what each box needs", () => {
    expect(boxesBlocker([], frame)).toBe("Draw a box on the image.");
    expect(boxesBlocker([box()], undefined)).toMatch(/image size is missing/);
    expect(boxesBlocker([box({ prompt: "" })], frame)).toBe("Describe what goes in box 1, or give it a reference image.");
    expect(boxesBlocker([box({ prompt: "", reference: "LAMP" })], frame)).toBeNull();
    expect(boxesBlocker([box({ action: "keep", prompt: "" })], frame)).toBeNull();
    expect(boxesBlocker([box({ action: "move", target: null })], frame)).toBe("Drag where box 1 moves to.");
    expect(boxesBlocker([box({ prompt: "" })], frame, true)).toBe("Describe what goes in box 1.");
  });

  it("reads regions saved from the mask era as boxes, and untrusted request boxes defensively", () => {
    expect(
      normalizeBoxRegion({ id: "r1", kind: "lasso", x: 5, y: 5, width: 50, height: 40, paths: [[[0, 0]]], fuzz: 8, prompt: "sky", referenceId: "a9" })
    ).toEqual({ id: "r1", x: 5, y: 5, width: 50, height: 40, action: "change", prompt: "sky", referenceId: "a9" });
    expect(normalizeBoxRegion({ id: "m", x: 1, y: 1, width: 9, height: 9, action: "move", target: { x: 20, y: 1, width: 9, height: 9 } })).toMatchObject({
      action: "move",
      target: { x: 20 }
    });
    expect(normalizeBoxRegion({ id: "bad", x: -1, y: 0, width: 5, height: 5 })).toBeNull();
    expect(normalizeRequestBoxes([{ x: 1, y: 2, width: 30, height: 40, prompt: "lamp", reference: "https://x/lamp.png" }, "junk"])).toEqual([
      { id: "box-1", x: 1, y: 2, width: 30, height: 40, action: "change", prompt: "lamp", reference: "https://x/lamp.png" }
    ]);
  });
});
