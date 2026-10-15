import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Flux3ImageSettingsFields } from "@/components/flux3-image-settings";
import {
  buildFlux3ImagePayload, estimateFlux3ImageUsd, normalizeFlux3ImageSettings,
  type Flux3ImageRequest
} from "@/lib/flux3-image";
import { normalizeFlux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import {
  FLUX3_IMAGE_ASPECT_RATIOS, FLUX3_IMAGE_KLEIN_MODEL, FLUX3_IMAGE_KLEIN_RESOLUTIONS, flux3ImageKleinSchema
} from "@/lib/flux3-image-klein";

const request = (settings: Record<string, unknown> = {}): Flux3ImageRequest => ({
  mode: "t2i", prompt: "a fox", settings: { model: FLUX3_IMAGE_KLEIN_MODEL, ...settings } as Flux3ImageRequest["settings"]
});

describe("official FLUX 3 Image Klein contract", () => {
  it("uses Klein defaults and preserves edit source sizing rather than forcing 1k", () => {
    const text = buildFlux3ImagePayload(request());
    expect(text).toEqual({ endpoint: FLUX3_IMAGE_KLEIN_MODEL, payload: {
      prompt: "a fox", aspect_ratio: "auto", resolution: null, safety_tolerance: 2, output_format: "jpeg"
    } });
    const edit = buildFlux3ImagePayload({ ...request(), mode: "edit", source: "https://example.com/fox.png" });
    expect(edit.payload).toEqual({ ...text.payload, images: ["https://example.com/fox.png"] });
    expect(text.payload).not.toHaveProperty("steps");
    expect(text.payload).not.toHaveProperty("seed");
    expect(estimateFlux3ImageUsd(request({ resolution: "4k" }))).toBeNull();
  });

  it("supports every tier, aspect and safety level, plus reproducibility and exact sizes", () => {
    for (const resolution of FLUX3_IMAGE_KLEIN_RESOLUTIONS) {
      expect(buildFlux3ImagePayload(request({ resolution })).payload.resolution).toBe(resolution);
    }
    for (const aspectRatio of FLUX3_IMAGE_ASPECT_RATIOS) {
      expect(buildFlux3ImagePayload(request({ aspectRatio })).payload.aspect_ratio).toBe(aspectRatio);
    }
    for (const safetyTolerance of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(buildFlux3ImagePayload(request({ safetyTolerance })).payload.safety_tolerance).toBe(safetyTolerance);
    }
    for (const seed of [0, 4294967295, null]) {
      for (const steps of [1, 16, null]) {
        expect(buildFlux3ImagePayload(request({ seed, steps, width: 6256, height: 64, outputFormat: "png", resolution: "1.5k" })).payload)
          .toMatchObject({ seed, steps, width: 6256, height: 64, output_format: "png", resolution: "1.5k" });
      }
    }
    expect(buildFlux3ImagePayload(request({ width: 64, height: 6256 })).payload).toMatchObject({ width: 64, height: 6256 });
    expect(buildFlux3ImagePayload(request({ width: 4107, height: 4096 })).payload.width).toBe(4107); // exact area cap
    expect(buildFlux3ImagePayload(request({ width: null, height: null, resolution: null })).payload).toMatchObject({ width: null, height: null, resolution: null });
  });

  it("keeps precise boxes on the source frame despite retained custom dimensions", () => {
    const settings = request({ width: 1200, height: 600, aspectRatio: "2:1" }).settings;
    const { payload } = buildFlux3ImagePayload({
      mode: "precise", source: "SOURCE", settings, frame: { width: 800, height: 1000 },
      regions: [{ id: "fox", x: 80, y: 100, width: 400, height: 500, action: "change", prompt: "a fox" }]
    });
    expect(payload.aspect_ratio).toBe("auto");
    expect(payload).not.toHaveProperty("width");
    expect(payload).not.toHaveProperty("height");
    expect(payload.prompt).toContain('"tgt_bbox":[100,100,600,600]');
    expect(settings).toMatchObject({ width: 1200, height: 600 });
  });

  it.each(["auto", "16:9"] as const)("keeps layout boxes on their %s frame despite retained custom dimensions", (aspectRatio) => {
    const settings = request({ width: 600, height: 1200, aspectRatio }).settings;
    const { payload } = buildFlux3ImagePayload({
      mode: "t2i", prompt: "a fox", settings,
      frame: { width: 1000, height: aspectRatio === "auto" ? 1000 : 563 },
      layout: [{ id: "fox", x: 100, y: 100, width: 200, height: 200, action: "change", prompt: "a fox" }]
    });
    expect(payload.aspect_ratio).toBe(aspectRatio === "auto" ? "1:1" : aspectRatio);
    expect(payload).not.toHaveProperty("width");
    expect(payload).not.toHaveProperty("height");
    expect(payload.prompt).toContain('"bbox":');
  });

  it.each(["t2i", "edit", "i2i"] as const)("preserves exact dimensions for unboxed %s runs", (mode) => {
    const { payload } = buildFlux3ImagePayload({
      ...request({ width: 1200, height: 600 }), mode, source: "SOURCE", references: ["REFERENCE"],
      layout: [], frame: { width: 1000, height: 1000 }
    });
    expect(payload).toMatchObject({ width: 1200, height: 600 });
  });

  it.each([
    { safetyTolerance: -1 }, { safetyTolerance: 8 }, { safetyTolerance: 2.5 }, { safetyTolerance: "2" }, { safetyTolerance: null },
    { seed: -1 }, { seed: 4294967296 }, { seed: 1.5 }, { seed: "0" },
    { steps: 0 }, { steps: 17 }, { steps: 1.5 }, { steps: "16" },
    { width: 63, height: 64 }, { width: 64, height: 6257 }, { width: 64.5, height: 64 },
    { width: 64 }, { height: 64 }, { width: 64, height: null }, { width: "64", height: 64 },
    { width: 4108, height: 4096 }, { width: 6256, height: 6256 },
    { aspectRatio: "16:10" }, { aspectRatio: null }, { resolution: "8k" }, { resolution: "" },
    { outputFormat: "webp" }, { outputFormat: null }, { grounding: false }, { version: "1" }, { extra: true },
    { prompt: "ignored" }, { images: [] }, { safety_tolerance: 2 }, { model: "unknown-model" }
  ])("rejects invalid or unsupported settings before building: %j", (settings) => {
    expect(() => buildFlux3ImagePayload(request(settings))).toThrow();
  });

  it("validates all documented image input forms and rejects extra provider fields", () => {
    for (const images of [undefined, null, "https://example.com/fox.png", ["base64"], Array(10).fill("base64")]) {
      expect(flux3ImageKleinSchema.safeParse({ prompt: "fox", images }).success).toBe(true);
    }
    for (const images of [[], Array(11).fill("base64"), [1], 1, {}]) {
      expect(flux3ImageKleinSchema.safeParse({ prompt: "fox", images }).success).toBe(false);
    }
    for (const extra of [{ grounding: true }, { version: "1" }, { outputFormat: "png" }, { extra: 1 }]) {
      expect(flux3ImageKleinSchema.safeParse({ prompt: "fox", ...extra }).success).toBe(false);
    }
    for (const prompt of [undefined, null, 1]) expect(flux3ImageKleinSchema.safeParse({ prompt }).success).toBe(false);
  });

  it("migrates saved provisional Klein drafts without losing supported settings", () => {
    const legacy = { model: FLUX3_IMAGE_KLEIN_MODEL, grounding: false, aspectRatio: "16:9", resolution: "1k", safetyTolerance: 3 };
    expect(normalizeFlux3ImageDraft({ settings: legacy }).settings).toMatchObject({
      model: FLUX3_IMAGE_KLEIN_MODEL, aspectRatio: "16:9", resolution: "1k", safetyTolerance: 3
    });
    expect(normalizeFlux3ImageDraft({ settings: legacy }).settings).not.toHaveProperty("grounding");
    expect(() => buildFlux3ImagePayload(request({ grounding: false }))).toThrow();
  });

  it("persists Klein settings and renders only Klein controls", () => {
    const settings = normalizeFlux3ImageSettings(request({ resolution: "1.5k", seed: 0, steps: 8, safetyTolerance: 7, width: 1000, height: 800 }).settings);
    expect(normalizeFlux3ImageDraft({ settings }).settings).toEqual(settings);
    expect(settings).not.toHaveProperty("grounding");
    const html = renderToStaticMarkup(createElement(Flux3ImageSettingsFields, { settings, onChange: () => {}, estimate: null }));
    expect(html).toContain("FLUX 3 Image Klein");
    expect(html).toContain("1.5K");
    expect(html).toContain("Seed");
    expect(html).toContain("Steps");
    expect(html).toContain("Not listed");
    expect(html).not.toContain("Grounding: web and image search");
  });
});
