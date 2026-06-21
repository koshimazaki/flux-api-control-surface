import { describe, expect, it } from "vitest";
import { buildToolRequestBody, toolRunBlocker, type ToolRunInput } from "@/lib/dashboard-tools";
import type { AssetRecord } from "@/lib/types";

const sourceAsset = { id: "asset-1", imageDataUrl: "data:image/png;base64,xx" } as AssetRecord;

function toolInput(overrides: Partial<ToolRunInput> = {}): ToolRunInput {
  return {
    mode: "erase",
    sourceAsset,
    apiKey: "k",
    mask: "data:image/png;base64,mm",
    prompt: "",
    seed: "",
    dilatePixels: 10,
    guidance: 30,
    steps: 50,
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

  it("blocks erase/inpaint without a mask", () => {
    expect(toolRunBlocker({ mode: "erase", mask: "", prompt: "", hasSource: true })).toMatch(/paint a mask/i);
    expect(toolRunBlocker({ mode: "inpaint", mask: "", prompt: "x", hasSource: true })).toMatch(/paint a mask/i);
  });

  // Regression for the inpaint-prompt guard added during the first review pass.
  it("blocks inpaint that has a mask but no prompt", () => {
    expect(toolRunBlocker({ mode: "inpaint", mask: "m", prompt: "   ", hasSource: true })).toMatch(/prompt/i);
  });

  it("allows a valid inpaint and a source-only outpaint", () => {
    expect(toolRunBlocker({ mode: "inpaint", mask: "m", prompt: "replace it", hasSource: true })).toBe("");
    expect(toolRunBlocker({ mode: "outpaint", mask: "", prompt: "", hasSource: true })).toBe("");
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
  });

  it("forwards fill guidance and steps for inpaint", () => {
    const body = buildToolRequestBody(toolInput({ mode: "inpaint", prompt: "replace it", guidance: 24, steps: 42 }));
    expect(body.tool).toBe("inpaint");
    expect(body.prompt).toBe("replace it");
    expect(body.guidance).toBe(24);
    expect(body.steps).toBe(42);
  });

  it("omits the mask and parses offsets for outpaint", () => {
    const body = buildToolRequestBody(
      toolInput({ mode: "outpaint", prompt: "extend", offsetX: "120", offsetY: "", canvasWidth: 1536 })
    );
    expect(body.mask).toBeUndefined();
    expect(body.offsetX).toBe(120);
    expect(body.offsetY).toBeNull();
    expect(body.canvasWidth).toBe(1536);
    expect(body.prompt).toBe("extend");
  });

  it("parses a numeric seed and nulls a blank one", () => {
    expect(buildToolRequestBody(toolInput({ seed: "42" })).seed).toBe(42);
    expect(buildToolRequestBody(toolInput({ seed: "" })).seed).toBeNull();
  });
});
