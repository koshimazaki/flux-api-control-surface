import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareToolImageInput: vi.fn(),
  resolveImageInput: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  normalizeImageInput: (value?: string) => value,
  resolveImageInput: mocks.resolveImageInput,
  imageToDataUrl: vi.fn(),
  outputExtension: vi.fn(),
  contentTypeForExtension: vi.fn(),
  redactImagePayload: (payload: Record<string, unknown>) => payload,
  saveOutputFiles: vi.fn(),
  patchOutputMetadataFile: vi.fn()
}));

vi.mock("@/lib/bfl-tool-inputs", () => ({
  prepareToolImageInput: mocks.prepareToolImageInput,
  prepareToolMaskInput: vi.fn(),
  prepareVtoGarmentInput: vi.fn()
}));

const { imageToolAdapter } = await import("@/lib/operations/image-tool");

async function preparePayload(body: Record<string, unknown>) {
  mocks.resolveImageInput.mockImplementation(async (value: string) => value);
  mocks.prepareToolImageInput.mockResolvedValue({ base64: "source-base64", width: 1024, height: 1024 });
  const prepared = await imageToolAdapter.prepare(body);
  if ("error" in prepared) throw new Error(String(prepared.error));
  return prepared.payload as Record<string, unknown>;
}

describe("image tool request payloads", () => {
  it("forwards a numeric seed for outpaint like every other tool branch", async () => {
    const payload = await preparePayload({
      tool: "outpaint",
      image: "/api/outputs/a/image",
      canvasWidth: 1536,
      canvasHeight: 1024,
      seed: 91
    });

    expect(payload.seed).toBe(91);
    expect(payload.width).toBe(1536);
    expect(payload.height).toBe(1024);
  });

  it("omits the seed for outpaint when none was supplied", async () => {
    const payload = await preparePayload({
      tool: "outpaint",
      image: "/api/outputs/a/image",
      canvasWidth: 1536,
      canvasHeight: 1024
    });

    expect("seed" in payload).toBe(false);
  });

  it("still forwards a numeric seed for deblur", async () => {
    const payload = await preparePayload({ tool: "deblur", image: "/api/outputs/a/image", seed: 7 });
    expect(payload.seed).toBe(7);
  });
});
