import { describe, expect, it } from "vitest";
import {
  buildToolAssetRecord,
  buildToolRequestBody,
  buildVtoGarmentCompositeAsset,
  toolRunBlocker,
  type ToolRunInput
} from "@/lib/dashboard-tools";
import type { AssetRecord } from "@/lib/types";

const sourceAsset = { id: "asset-1", title: "tropical membrane flower", imageDataUrl: "data:image/png;base64,xx" } as AssetRecord;
const garmentAsset = { id: "garment-1", title: "surf jacket", imageDataUrl: "data:image/png;base64,gg" } as AssetRecord;
const secondGarmentAsset = { id: "garment-2", title: "linen trousers", imageDataUrl: "data:image/png;base64,tt" } as AssetRecord;

function toolInput(overrides: Partial<ToolRunInput> = {}): ToolRunInput {
  return {
    mode: "erase",
    sourceAsset,
    vtoGarments: [],
    apiKey: "k",
    mask: "data:image/png;base64,mm",
    prompt: "",
    seed: "",
    dilatePixels: 10,
    guidance: 30,
    steps: 50,
    safetyTolerance: 2,
    outputFormat: "png",
    autoCrop: false,
    canvasWidth: 1024,
    canvasHeight: 1024,
    offsetX: "",
    offsetY: "",
    outpaintMode: "high",
    ...overrides
  };
}

describe("toolRunBlocker", () => {
  it("blocks when there is no source", () => {
    expect(toolRunBlocker({ mode: "erase", mask: "m", prompt: "", hasSource: false })).toMatch(/source image/i);
  });

  it("blocks erase without a mask", () => {
    expect(toolRunBlocker({ mode: "erase", mask: "", prompt: "", hasSource: true })).toMatch(/paint a mask/i);
  });

  it("blocks VTO without a garment or prompt", () => {
    expect(toolRunBlocker({ mode: "vto", mask: "", prompt: "try this on", garmentCount: 0, hasSource: true })).toMatch(/garment/i);
    expect(toolRunBlocker({ mode: "vto", mask: "", prompt: "   ", garmentCount: 1, hasSource: true })).toMatch(/prompt/i);
  });

  it("allows valid VTO plus source-only outpaint and deblur", () => {
    expect(toolRunBlocker({ mode: "vto", mask: "", prompt: "wear the jacket", garmentCount: 1, hasSource: true })).toBe("");
    expect(toolRunBlocker({ mode: "outpaint", mask: "", prompt: "", hasSource: true })).toBe("");
    expect(toolRunBlocker({ mode: "deblur", mask: "", prompt: "", hasSource: true })).toBe("");
  });
});

describe("buildToolRequestBody", () => {
  it("omits the prompt for erase and forwards the mask", () => {
    const body = buildToolRequestBody(toolInput({ mode: "erase", prompt: "ignored" }));
    expect(body.tool).toBe("erase");
    expect(body.prompt).toBeUndefined();
    expect(body.mask).toBe("data:image/png;base64,mm");
    expect(body.image).toBe("data:image/png;base64,xx");
    expect(body.sourceAssetId).toBe("asset-1");
    expect(body.guidance).toBeUndefined();
    expect(body.steps).toBeUndefined();
    expect(body.safetyTolerance).toBeUndefined();
    expect(body.outputFormat).toBe("png");
  });

  it("forwards garments and prompt for VTO", () => {
    const body = buildToolRequestBody(toolInput({ mode: "vto", prompt: "wear the jacket", vtoGarments: [garmentAsset] }));
    expect(body.tool).toBe("vto");
    expect(body.prompt).toBe("wear the jacket");
    expect(body.title).toContain("wear the jacket");
    expect(body.title).toContain("surf jacket");
    expect(body.garments).toEqual(["data:image/png;base64,gg"]);
    expect(body.mask).toBeUndefined();
    expect(body.guidance).toBeUndefined();
    expect(body.steps).toBeUndefined();
  });

  it("omits the mask and parses offsets for outpaint", () => {
    const body = buildToolRequestBody(
      toolInput({ mode: "outpaint", prompt: "extend", offsetX: "120", offsetY: "", canvasWidth: 1536, autoCrop: true })
    );
    expect(body.mask).toBeUndefined();
    expect(body.offsetX).toBe(120);
    expect(body.offsetY).toBeNull();
    expect(body.canvasWidth).toBe(1536);
    expect(body.prompt).toBe("extend");
    expect(body.autoCrop).toBe(true);
    expect(body.title).toContain("extend");
  });

  it("sends deblur as a source-only image tool", () => {
    const body = buildToolRequestBody(toolInput({ mode: "deblur", mask: "ignored", prompt: "ignored", seed: "88" }));
    expect(body.tool).toBe("deblur");
    expect(body.image).toBe("data:image/png;base64,xx");
    expect(body.mask).toBeUndefined();
    expect(body.prompt).toBeUndefined();
    expect(body.canvasWidth).toBeUndefined();
    expect(body.canvasHeight).toBeUndefined();
    expect(body.mode).toBeUndefined();
    expect(body.seed).toBe(88);
    expect(body.safetyTolerance).toBe(2);
  });

  it("parses a numeric seed and nulls a blank one", () => {
    expect(buildToolRequestBody(toolInput({ seed: "42" })).seed).toBe(42);
    expect(buildToolRequestBody(toolInput({ seed: "" })).seed).toBeNull();
  });

  it("clamps safety tolerance by tool contract", () => {
    expect(buildToolRequestBody(toolInput({ mode: "erase", safetyTolerance: 9 })).safetyTolerance).toBeUndefined();
    expect(buildToolRequestBody(toolInput({ mode: "outpaint", safetyTolerance: 9 })).safetyTolerance).toBeUndefined();
    expect(buildToolRequestBody(toolInput({ mode: "deblur", safetyTolerance: 9 })).safetyTolerance).toBe(5);
    expect(buildToolRequestBody(toolInput({ mode: "vto", prompt: "wear this", vtoGarments: [garmentAsset], safetyTolerance: 9 })).safetyTolerance).toBe(5);
  });

  it("coerces unsupported tool output formats before submitting", () => {
    expect(buildToolRequestBody(toolInput({ mode: "erase", outputFormat: "webp" })).outputFormat).toBe("png");
    expect(buildToolRequestBody(toolInput({ mode: "outpaint", outputFormat: "webp" })).outputFormat).toBe("png");
    expect(buildToolRequestBody(toolInput({ mode: "deblur", outputFormat: "webp" })).outputFormat).toBe("webp");
    expect(buildToolRequestBody(toolInput({ mode: "vto", prompt: "wear this", vtoGarments: [garmentAsset], outputFormat: "webp" })).outputFormat).toBe("webp");
  });
});

describe("buildToolAssetRecord", () => {
  it("stores the submitted tool prompt instead of inheriting the source prompt", () => {
    const asset = buildToolAssetRecord(
      { id: "result-1", imageDataUrl: "data:image/png;base64,out", sampleUrl: "https://x/out.png", endpointName: "flux-tools/vto-v1" },
      toolInput({ mode: "vto", prompt: "man on the beach", vtoGarments: [garmentAsset] })
    );
    expect(asset.title).toContain("man on the beach");
    expect(asset.prompt).toBe("man on the beach");
  });

  it("marks source-only tool outputs as no-prompt passes", () => {
    const asset = buildToolAssetRecord(
      { id: "result-2", imageDataUrl: "data:image/png;base64,out", sampleUrl: "https://x/out.png", endpointName: "flux-tools/deblur-v1" },
      toolInput({ mode: "deblur", prompt: "ignored global prompt" })
    );
    expect(asset.prompt).toBe("[deblur pass, no prompt]");
  });
});

describe("buildVtoGarmentCompositeAsset", () => {
  it("creates a local gallery asset for the exact VTO garment collage sent to BFL", () => {
    const asset = buildVtoGarmentCompositeAsset(
      {
        id: "vto-result-1",
        garmentSummary: { count: 2, composite: true, width: 1024, height: 1024 },
        garmentComposite: {
          id: "vto-result-1-garment-collage",
          title: "vto garment collage - vto - wear this outfit - garment surf jacket",
          imageDataUrl: "data:image/png;base64,collage",
          count: 2,
          width: 1024,
          height: 1024,
          outputFiles: {
            imagePath: "../outputs/flux-api-control-surface/vto-result-1-garment-collage.png",
            promptPath: "../outputs/flux-api-control-surface/vto-result-1-garment-collage.prompt.txt",
            metadataPath: "../outputs/flux-api-control-surface/vto-result-1-garment-collage.json"
          }
        }
      },
      toolInput({
        mode: "vto",
        prompt: "wear this outfit",
        vtoGarments: [garmentAsset, secondGarmentAsset]
      })
    );

    expect(asset).toMatchObject({
      id: "vto-result-1-garment-collage",
      title: "vto garment collage - vto - wear this outfit - garment surf jacket",
      imageDataUrl: "data:image/png;base64,collage",
      imageUrl: "/api/outputs/vto-result-1-garment-collage/image",
      sampleUrl: "/api/outputs/vto-result-1-garment-collage/image",
      model: "vto-garment-composite",
      provider: "local-vto-preflight",
      operation: "vto-garment-composite",
      assetKind: "asset",
      width: 1024,
      height: 1024,
      sourceAssetId: "asset-1",
      localImagePath: "../outputs/flux-api-control-surface/vto-result-1-garment-collage.png"
    });
    expect(asset?.payload.garmentAssetIds).toEqual(["garment-1", "garment-2"]);
    expect(asset?.references.map((reference) => reference.name)).toEqual(["surf jacket", "linen trousers"]);
    expect(asset?.runSettings?.sentToBflAs).toBe("garment");
  });

  it("omits the local collage card when VTO did not create a composite", () => {
    expect(
      buildVtoGarmentCompositeAsset(
        { id: "vto-result-1", garmentSummary: { count: 1, composite: false, width: 640, height: 640 } },
        toolInput({ mode: "vto", prompt: "wear this", vtoGarments: [garmentAsset] })
      )
    ).toBeNull();
  });
});
