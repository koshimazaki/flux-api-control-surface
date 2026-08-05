import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/bfl/generate/route";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  getCredits: vi.fn(),
  imageToDataUrl: vi.fn(),
  pollResult: vi.fn(),
  prepareToolImageInput: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveImageInput: vi.fn(),
  saveOutputFiles: vi.fn(),
  syncOutputToRemote: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  contentTypeForExtension: vi.fn((extension: string, fallback: string) =>
    extension === "png" ? "image/png" : fallback
  ),
  getCredits: mocks.getCredits,
  imageToDataUrl: mocks.imageToDataUrl,
  outputExtension: vi.fn((outputFormat: string) => outputFormat),
  pollResult: mocks.pollResult,
  redactImagePayload: vi.fn((payload: Record<string, unknown>) => payload),
  resolveApiKey: mocks.resolveApiKey,
  resolveImageInput: mocks.resolveImageInput,
  saveOutputFiles: mocks.saveOutputFiles
}));

vi.mock("@/lib/png-metadata", () => ({
  embedPngMetadata: vi.fn((buffer: Buffer) => buffer)
}));

vi.mock("@/lib/bfl-tool-inputs", () => ({
  prepareToolImageInput: mocks.prepareToolImageInput
}));

vi.mock("@/lib/remote-archive", () => ({
  syncOutputToRemote: mocks.syncOutputToRemote
}));

function mockSuccessfulGeneration() {
  mocks.resolveApiKey.mockResolvedValue("test-key");
  mocks.getCredits.mockResolvedValue(100);
  // The route now enqueues onto the server queue, which submits with POST and
  // then takes one poll step at a time with GET instead of a blocking loop.
  mocks.bflJson.mockImplementation(async (method: string) =>
    method === "POST"
      ? {
          id: "job-1",
          polling_url: "https://poll.example/job-1",
          cost: 3,
          input_mp: 1,
          output_mp: 1
        }
      : { status: "Ready", result: { sample: "https://images.example/job-1.png" } }
  );
  mocks.pollResult.mockResolvedValue({
    status: "Ready",
    result: { sample: "https://images.example/job-1.png" }
  });
  mocks.imageToDataUrl.mockResolvedValue({
    buffer: Buffer.from("png"),
    contentType: "image/png"
  });
  mocks.saveOutputFiles.mockResolvedValue({
    imagePath: "outputs/job-1.png",
    promptPath: "outputs/job-1.prompt.txt",
    metadataPath: "outputs/job-1.json",
    outputDir: "outputs",
    fileBaseName: "job-1"
  });
  mocks.syncOutputToRemote.mockResolvedValue({ ok: true, outputFiles: {} });
  mocks.resolveImageInput.mockImplementation(async (value: string) => value);
  mocks.prepareToolImageInput.mockResolvedValue({
    base64: "clean-reference-png-base64",
    width: 320,
    height: 240
  });
}

describe("BFL generate route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("wraps a plain text request body as the generation prompt", async () => {
    mockSuccessfulGeneration();
    const prompt =
      "indiana johnes like man researcher running away from massive twister, tornado, sky is falling apart";

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/generate", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: prompt
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-2-pro-preview",
      "test-key",
      expect.objectContaining({
        prompt,
        width: 1024,
        height: 1024,
        output_format: "png"
      })
    );
  });

  it("keeps JSON request bodies on the structured path", async () => {
    mockSuccessfulGeneration();

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "cinematic explorer running from a tornado",
          model: "klein-9b",
          width: 512,
          height: 768,
          seed: 42
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-2-klein-9b",
      "test-key",
      expect.objectContaining({
        prompt: "cinematic explorer running from a tornado",
        width: 512,
        height: 768,
        seed: 42
      })
    );
  });

  it("rejects invalid JSON bodies instead of treating them as plain prompts", async () => {
    mockSuccessfulGeneration();

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"prompt":"truncated prompt",'
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Request body must be valid JSON.");
    expect(mocks.bflJson).not.toHaveBeenCalled();
  });

  it("resolves and re-encodes references before submitting them to BFL", async () => {
    mockSuccessfulGeneration();
    mocks.resolveImageInput.mockResolvedValue("data:image/png;base64,raw-reference");

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "cinematic explorer running from a tornado",
          references: ["/api/outputs/ref-1/image"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveImageInput).toHaveBeenCalledWith(
      "/api/outputs/ref-1/image",
      "http://localhost"
    );
    expect(mocks.prepareToolImageInput).toHaveBeenCalledWith(
      "data:image/png;base64,raw-reference",
      "reference image 1",
      {
        dimensionMultiple: 8,
        flattenBackground: "#ffffff",
        imageFormat: "jpeg",
        jpegQuality: 95,
        maxDimension: 1280,
        maxMegapixels: 4,
        targetAspectRatios: [
          [1, 1],
          [5, 4],
          [4, 5],
          [4, 3],
          [3, 4],
          [16, 9],
          [9, 16],
          [2, 1],
          [1, 2],
          [3, 1],
          [1, 3]
        ]
      }
    );
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-2-pro-preview",
      "test-key",
      expect.objectContaining({
        input_image: "clean-reference-png-base64"
      })
    );
  });

  it("returns server reference diagnostics when a generation request fails", async () => {
    mockSuccessfulGeneration();
    mocks.resolveImageInput.mockResolvedValue("data:image/png;base64,raw-reference");
    // 422 is terminal, so the queue fails it immediately instead of retrying.
    mocks.bflJson.mockRejectedValue(new Error('BFL API 422: {"detail":"invalid image input"}'));

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "cinematic explorer running from a tornado",
          references: ["/api/outputs/ref-1/image"]
        })
      })
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("BFL API 422");
    // The diagnostics the browser needs to explain a rejected reference.
    expect(data.details.references).toEqual([
      { slot: "input_image", normalized: true, format: "jpeg", width: 320, height: 240, bytes: expect.any(Number) }
    ]);
  });

  it("can skip reference normalization when requested", async () => {
    mockSuccessfulGeneration();
    mocks.resolveImageInput.mockResolvedValue("data:image/png;base64,raw-reference");

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: "cinematic explorer running from a tornado",
          normalizeReferences: false,
          references: ["/api/outputs/ref-1/image"]
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.prepareToolImageInput).not.toHaveBeenCalled();
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-2-pro-preview",
      "test-key",
      expect.objectContaining({
        input_image: "data:image/png;base64,raw-reference"
      })
    );
  });
});
