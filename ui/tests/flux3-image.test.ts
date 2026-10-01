import { describe, expect, it } from "vitest";
import {
  FLUX3_IMAGE_API,
  FLUX3_IMAGE_API_PENDING,
  FLUX3_IMAGE_MAX_REFERENCES,
  boxFromDrag,
  normalizeFlux3ImageSettings,
  buildFlux3ImagePayload,
  estimateFlux3ImageUsd,
  flux3ImageRequestBlocker,
  hardenMaskPixels,
  placeReferenceIds,
  removeReference,
  type Flux3ImageApi,
  type Flux3ImageRequestRegion
} from "@/lib/flux3-image";

const SOURCE = "data:image/png;base64,AAAA";
const FRAME = { width: 400, height: 200 };
const region = (patch: Partial<Flux3ImageRequestRegion> = {}): Flux3ImageRequestRegion => ({
  id: "region-a",
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  action: "change",
  prompt: "make the scarf red",
  ...patch
});
// Stands in for an API in the injection test; the shipped module maps the published schema.
const testApi: Flux3ImageApi = {
  endpoint: "test-endpoint",
  toPayload: (request) => ({ mode: request.mode, regions: request.regions?.length ?? 0 }),
  estimateUsd: () => 0.05
};

describe("FLUX 3 Image request blocker", () => {
  it("names the missing input for each mode before anything else", () => {
    expect(flux3ImageRequestBlocker({ mode: "t2i", prompt: " " })).toBe("Describe the image you want.");
    expect(flux3ImageRequestBlocker({ mode: "i2i", prompt: "the fox from image 1", references: [] })).toBe(
      "Add at least one reference image."
    );
    expect(flux3ImageRequestBlocker({ mode: "i2i", references: [SOURCE] })).toBe(
      "Describe the image to make from the references."
    );
    expect(
      flux3ImageRequestBlocker({
        mode: "i2i",
        prompt: "x",
        references: Array.from({ length: FLUX3_IMAGE_MAX_REFERENCES + 1 }, () => SOURCE)
      })
    ).toBe(`FLUX 3 Image takes up to ${FLUX3_IMAGE_MAX_REFERENCES} references here.`);
    expect(flux3ImageRequestBlocker({ mode: "edit", prompt: "sunset" })).toBe("Load a source image to edit.");
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE })).toBe("Describe the edit.");
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, regions: [], frame: FRAME })).toBe("Draw a box on the image.");
    expect(
      flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, regions: [region(), region({ id: "b", prompt: "" })], frame: FRAME })
    ).toBe("Describe what goes in box 2, or give it a reference image.");
  });

  it("edits the whole image, sends boxes for precise edits, and points masks at boxes", () => {
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE, prompt: "dusk light" })).toBeNull();
    expect(flux3ImageRequestBlocker({ mode: "edit", source: SOURCE, prompt: "dusk light", mask: SOURCE })).toMatch(
      /takes no mask\. Use Precise/
    );
    expect(flux3ImageRequestBlocker({ mode: "precise", source: SOURCE, regions: [region()], frame: FRAME })).toBeNull();
    const { payload } = buildFlux3ImagePayload({
      mode: "precise",
      source: SOURCE,
      prompt: "keep it subtle",
      regions: [region(), region({ id: "b", action: "keep", prompt: "the face", x: 200 }), region({ id: "c", prompt: "a lamp", reference: "LAMP" })],
      frame: FRAME,
      // Boxes are drawn on the source frame, so an explicit ratio is overridden with auto.
      settings: { aspectRatio: "16:9", resolution: "2k" }
    });
    expect(payload).toMatchObject({ images: [SOURCE, "LAMP"], aspect_ratio: "auto", resolution: "2k" });
    const prompt = String(payload.prompt);
    expect(prompt.startsWith("keep it subtle. In <ref_image_0>, make the scarf red <scarf_red_1> at the top left; add a lamp <lamp_1> from image 2 at the top left.")).toBe(true);
    expect(JSON.parse(prompt.slice(prompt.indexOf(" [") + 1))).toEqual([
      { id: "scarf_red_1", from: null, src_bbox: null, tgt_bbox: [100, 25, 500, 275], desc: "make the scarf red" },
      { id: "face_1", from: "ref_image_0", src_bbox: [100, 500, 500, 750], tgt_bbox: [100, 500, 500, 750], desc: "the face" },
      { id: "lamp_1", from: "ref_image_1", src_bbox: [0, 0, 1000, 1000], tgt_bbox: [100, 25, 500, 275], desc: "a lamp" }
    ]);
  });

  it("lays text to image out with boxes on the chosen frame, and leaves empty layouts plain", () => {
    const layout = [region({ x: 0, y: 0, width: 1000, height: 563, prompt: "a misty pine forest" })];
    const { payload } = buildFlux3ImagePayload({
      mode: "t2i",
      prompt: "a glass fox",
      layout,
      frame: { width: 1000, height: 563 },
      settings: { aspectRatio: "16:9" }
    });
    expect(payload.aspect_ratio).toBe("16:9");
    expect(String(payload.prompt)).toMatch(/^a glass fox\. With a misty pine forest <misty_pine_1> across the whole frame\. \[\{"id":"misty_pine_1","bbox":\[0,0,1000,1000\]/);
    expect(buildFlux3ImagePayload({ mode: "t2i", prompt: "a glass fox", layout: [], frame: { width: 1000, height: 1000 } }).payload.prompt).toBe(
      "a glass fox"
    );
    // A layout on auto is square, since nothing else sets the frame.
    expect(buildFlux3ImagePayload({ mode: "t2i", prompt: "x", layout, frame: { width: 1000, height: 1000 } }).payload.aspect_ratio).toBe("1:1");
  });

  it("maps the published Flux3ImageInputs schema and sends nothing else", () => {
    const published = ["prompt", "images", "aspect_ratio", "resolution", "grounding", "safety_tolerance", "version"];
    expect(FLUX3_IMAGE_API?.endpoint).toBe("flux-3-image");
    const t2i = buildFlux3ImagePayload({ mode: "t2i", prompt: " a fox " });
    expect(t2i).toEqual({
      endpoint: "flux-3-image",
      payload: { prompt: "a fox", aspect_ratio: "auto", resolution: "1k", grounding: true, safety_tolerance: 2 }
    });
    const i2i = buildFlux3ImagePayload({ mode: "i2i", prompt: "image 1 at night", references: [SOURCE, "", SOURCE] });
    expect(i2i.payload.images).toEqual([SOURCE, SOURCE]);
    const edit = buildFlux3ImagePayload({ mode: "edit", prompt: "night", source: SOURCE, settings: { resolution: "4k" } });
    expect(edit.payload).toMatchObject({ images: [SOURCE], resolution: "4k" });
    for (const { payload } of [t2i, i2i, edit]) {
      expect(Object.keys(payload).every((key) => published.includes(key))).toBe(true);
    }
    // Priced per image by resolution; the unpriced 1.5k tier is not offered.
    expect(estimateFlux3ImageUsd({ mode: "t2i", prompt: "a fox" })).toBe(0.048);
    expect(estimateFlux3ImageUsd({ mode: "t2i", prompt: "a fox", settings: { resolution: "4k" } })).toBe(0.607);
    expect(normalizeFlux3ImageSettings({ resolution: "1.5k" }).resolution).toBe("1k");
  });

  it("keeps settings inside the schema's enums and range", () => {
    expect(normalizeFlux3ImageSettings({ aspectRatio: "7:5", resolution: "2k", grounding: false, safetyTolerance: 3.6 })).toEqual({
      aspectRatio: "7:5",
      resolution: "2k",
      grounding: false,
      safetyTolerance: 4
    });
    expect(normalizeFlux3ImageSettings({ aspectRatio: "3:1", resolution: "8k", grounding: "yes", safetyTolerance: -2 })).toEqual({
      aspectRatio: "auto",
      resolution: "1k",
      grounding: true,
      safetyTolerance: 0
    });
  });

  it("still reports a missing API, and builds through an injected one", () => {
    const request = { mode: "i2i" as const, prompt: "image 1 at dusk", references: [SOURCE] };
    expect(flux3ImageRequestBlocker(request, null)).toBe(FLUX3_IMAGE_API_PENDING);
    expect(() => buildFlux3ImagePayload(request, null)).toThrow(FLUX3_IMAGE_API_PENDING);
    expect(flux3ImageRequestBlocker(request, testApi)).toBeNull();
    expect(estimateFlux3ImageUsd(request, testApi)).toBe(0.05);
    expect(buildFlux3ImagePayload(request, testApi)).toEqual({ endpoint: "test-endpoint", payload: { mode: "i2i", regions: 0 } });
  });
});

describe("reference slots", () => {
  it("takes up to ten images, as the published schema says", () => {
    expect(FLUX3_IMAGE_MAX_REFERENCES).toBe(10);
  });

  it("puts the first id in the target slot and the rest in empty slots, dropping overflow, with no gaps", () => {
    // Dropped on slot 4 with slots 1 and 3 empty: it becomes image 2, the second image sent.
    expect(placeReferenceIds([null, "a", null, null], ["x"], 3)).toEqual(["a", "x", null, null]);
    expect(placeReferenceIds([null, "a", null, null], ["x", "y", "z"], 1)).toEqual(["y", "x", "z", null]);
    expect(placeReferenceIds(["a", "b", "c", "d"], ["x", "y"], 0)).toEqual(["x", "b", "c", "d"]);
  });

  it("moves later images up on removal and renumbers the prompt to match", () => {
    const removed = removeReference(["fox", "hat", "coat", null], 0, "Put the coat from Image 3 on the fox, with the hat from image #2.");
    expect(removed.references).toEqual(["hat", "coat", null, null]);
    expect(removed).toMatchObject({ moved: 2, renumbered: true, namesRemoved: false });
    expect(removed.prompt).toBe("Put the coat from Image 2 on the fox, with the hat from image #1.");
  });

  it("leaves the prompt alone when it names the removed image, and says so", () => {
    const removed = removeReference(["fox", "hat", "coat"], 1, "The fox from image 1 wears the hat from image 2 and coat from image 3.");
    expect(removed).toMatchObject({ references: ["fox", "coat", null], moved: 1, namesRemoved: true, renumbered: false });
    expect(removed.prompt).toBe("The fox from image 1 wears the hat from image 2 and coat from image 3.");
  });

  it("renumbers nothing when the last image goes, or when the prompt names none of the moved ones", () => {
    expect(removeReference(["fox", "hat"], 1, "the fox from image 1")).toMatchObject({ references: ["fox", null], moved: 0, renumbered: false });
    expect(removeReference(["fox", "hat"], 0, "a fox in a hat")).toMatchObject({ references: ["hat", null], moved: 1, renumbered: false, prompt: "a fox in a hat" });
  });
});

describe("box drawing and Erase's mask", () => {
  it("turns a drag in any direction into a box clamped to the image", () => {
    const size = { width: 400, height: 300 };
    expect(boxFromDrag({ x: 350.4, y: 10 }, { x: 500, y: -20 }, size)).toEqual({ x: 350, y: 0, width: 50, height: 10 });
    expect(boxFromDrag({ x: 120, y: 90 }, { x: 20, y: 30 }, size)).toEqual({ x: 20, y: 30, width: 100, height: 60 });
    expect(boxFromDrag({ x: 10, y: 10 }, { x: 14, y: 90 }, size)).toBeNull();
  });

  it("makes every mask pixel fully selected or not", () => {
    const pixels = new Uint8ClampedArray([200, 200, 200, 255, 90, 90, 90, 255, 128, 128, 128, 255]);
    expect(Array.from(hardenMaskPixels(pixels))).toEqual([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  });
});
