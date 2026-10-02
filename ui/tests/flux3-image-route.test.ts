import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { POST } from "@/app/api/bfl/flux3-image/route";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  getCredits: vi.fn(),
  imageToDataUrl: vi.fn(),
  pollResult: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveImageInput: vi.fn(),
  saveOutputFiles: vi.fn(),
  patchOutputMetadataFile: vi.fn(),
  syncOutputToRemote: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  patchOutputMetadataFile: mocks.patchOutputMetadataFile,
  contentTypeForExtension: vi.fn((extension: string, fallback: string) => (extension === "png" ? "image/png" : fallback)),
  getCredits: mocks.getCredits,
  imageToDataUrl: mocks.imageToDataUrl,
  normalizeImageInput: (value?: string) => value?.replace(/^data:[^,]*;base64,/, ""),
  outputExtension: vi.fn(() => "png"),
  pollResult: mocks.pollResult,
  redactImagePayload: vi.fn((payload: Record<string, unknown>) => payload),
  resolveApiKey: mocks.resolveApiKey,
  resolveImageInput: mocks.resolveImageInput,
  saveOutputFiles: mocks.saveOutputFiles
}));

vi.mock("@/lib/png-metadata", () => ({ embedPngMetadata: vi.fn((buffer: Buffer) => buffer) }));
vi.mock("@/lib/remote-archive", () => ({ syncOutputToRemote: mocks.syncOutputToRemote }));

function post(body: Record<string, unknown>, requestKey?: string) {
  return POST(
    new NextRequest("http://localhost/api/bfl/flux3-image", {
      method: "POST",
      headers: { "content-type": "application/json", ...(requestKey ? { "Idempotency-Key": requestKey } : {}) },
      body: JSON.stringify(body)
    })
  );
}

function mockSuccess() {
  mocks.resolveApiKey.mockResolvedValue("test-key");
  mocks.getCredits.mockResolvedValue(100);
  mocks.bflJson.mockImplementation(async (method: string) =>
    method === "POST"
      ? { id: "f3i-1", polling_url: "https://poll.example/f3i-1", cost: 4 }
      : { status: "Ready", result: { sample: "https://images.example/f3i-1.png" } }
  );
  mocks.pollResult.mockResolvedValue({ status: "Ready", result: { sample: "https://images.example/f3i-1.png" } });
  mocks.imageToDataUrl.mockResolvedValue({ buffer: Buffer.from("png"), contentType: "image/png" });
  mocks.resolveImageInput.mockImplementation(async (value: string) => value);
  mocks.patchOutputMetadataFile.mockResolvedValue(true);
  mocks.syncOutputToRemote.mockResolvedValue({ ok: true });
  mocks.saveOutputFiles.mockResolvedValue({
    imagePath: "outputs/f3i-1.png",
    promptPath: "outputs/f3i-1.prompt.txt",
    metadataPath: "outputs/f3i-1.json",
    outputDir: "outputs",
    fileBaseName: "f3i-1"
  });
}

const submitted = () => mocks.bflJson.mock.calls.find(([method]) => method === "POST");

describe("FLUX 3 Image route", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends text to image with the published fields only, then saves it like any image", async () => {
    mockSuccess();
    const response = await post({
      mode: "t2i",
      prompt: "  a glass fox at dawn ",
      settings: { aspectRatio: "16:9", resolution: "2k", grounding: false, safetyTolerance: 9 },
      title: "glass fox"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(submitted()).toEqual([
      "POST",
      "https://api.bfl.ai/v1/flux-3-image",
      "test-key",
      { prompt: "a glass fox at dawn", aspect_ratio: "16:9", resolution: "2k", grounding: false, safety_tolerance: 4 }
    ]);
    expect(mocks.saveOutputFiles).toHaveBeenCalledWith(expect.objectContaining({ title: "glass fox", prompt: "a glass fox at dawn" }));
    expect(body.flux3Image).toMatchObject({ mode: "t2i", imageCount: 0, settings: { resolution: "2k" } });
    // Saved with the rest of the metadata, not patched in afterwards.
    expect(mocks.saveOutputFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ runSettings: expect.objectContaining({ flux3Image: body.flux3Image }), operation: "flux3-image:t2i" })
      })
    );
  });

  it("queues as flux-3-image at the tier's price, not as a FLUX.2 job", async () => {
    mockSuccess();
    const response = await post({ mode: "t2i", prompt: "fox", settings: { resolution: "4k" }, wait: false });
    expect(response.status).toBe(202);
    expect((await response.json()).job).toMatchObject({ model: "flux-3-image", estimatedUsd: 0.607, estimatedCredits: 61 });
    // Let the queued job finish so it does not run into the next test.
    await vi.waitFor(() => expect(mocks.saveOutputFiles).toHaveBeenCalled(), { timeout: 5_000 });
  });

  it("refuses a size or shape it does not send, rather than quietly making a 1k image", async () => {
    mockSuccess();
    const unpriced = await post({ mode: "t2i", prompt: "fox", settings: { resolution: "1.5k" } });
    expect(unpriced.status).toBe(400);
    expect((await unpriced.json()).error).toBe("FLUX 3 Image resolution 1.5k has no listed price, so it is not offered here. Use 768sq, 1k, 2k, 4k.");

    const misspelt = await post({ mode: "t2i", prompt: "fox", settings: { resolution: "2K" } });
    expect((await misspelt.json()).error).toMatch(/resolution must be one of 768sq, 1k, 2k, 4k, not "2K"/);

    const shape = await post({ mode: "t2i", prompt: "fox", settings: { aspectRatio: "16:10" } });
    expect(shape.status).toBe(400);
    expect((await shape.json()).error).toMatch(/aspectRatio must be one of auto, 21:9.*not "16:10"/);
    expect(mocks.bflJson).not.toHaveBeenCalledWith("POST", expect.anything(), expect.anything(), expect.anything());

    // Settings left out still take the API's defaults.
    const defaults = await post({ mode: "t2i", prompt: "fox" });
    expect(defaults.status).toBe(200);
    expect(submitted()?.[3]).toMatchObject({ resolution: "1k", aspect_ratio: "auto" });
  });

  it("sends references as base64 or URLs in one images array", async () => {
    mockSuccess();
    mocks.resolveImageInput.mockImplementation(async (value: string) =>
      value.startsWith("/api/outputs/") ? "data:image/png;base64,SAVED" : value
    );
    const response = await post({
      mode: "i2i",
      prompt: "the fox from image 1 in the coat from image 2",
      references: ["data:image/jpeg;base64,FOX", "/api/outputs/coat/image", "https://example.com/light.png"]
    });

    expect(response.status).toBe(200);
    expect(submitted()?.[3]).toEqual({
      prompt: "the fox from image 1 in the coat from image 2",
      images: ["FOX", "SAVED", "https://example.com/light.png"],
      aspect_ratio: "auto",
      resolution: "1k",
      grounding: true,
      safety_tolerance: 2
    });
  });

  it("refuses a mask before any paid call, pointing at boxes", async () => {
    mockSuccess();
    const masked = await post({ mode: "edit", prompt: "dusk", source: "data:image/png;base64,SRC", mask: "data:image/png;base64,MASK" });
    expect(masked.status).toBe(400);
    expect((await masked.json()).error).toMatch(/takes no mask\. Use Precise/);
    expect(mocks.bflJson).not.toHaveBeenCalledWith("POST", expect.anything(), expect.anything(), expect.anything());
  });

  it("names an image outside BFL's documented 256 px to 16 MP range before any paid call", async () => {
    mockSuccess();
    const flat = async (width: number, height: number) =>
      `data:image/png;base64,${(await sharp({ create: { width, height, channels: 3, background: "#808080" } }).png().toBuffer()).toString("base64")}`;

    const small = await post({ mode: "edit", prompt: "dusk", source: await flat(300, 200) });
    expect(small.status).toBe(400);
    expect((await small.json()).error).toBe("Image 1 is 300 × 200; FLUX 3 Image needs at least 256 × 256.");

    const large = await post({ mode: "i2i", prompt: "combine them", references: [await flat(256, 256), await flat(4100, 4100)] });
    expect(large.status).toBe(400);
    expect((await large.json()).error).toMatch(/^Image 2 is 4100 × 4100, over FLUX 3 Image's limit of 16 megapixels/);
    expect(mocks.bflJson).not.toHaveBeenCalledWith("POST", expect.anything(), expect.anything(), expect.anything());

    // Exactly 16 MP, the size of a square 4k result, is inside the range.
    const edge = await post({ mode: "edit", prompt: "dusk", source: await flat(4096, 4096) });
    expect(edge.status).toBe(200);
  });

  it("sends a precise edit as boxes in the prompt, with box references after the source", async () => {
    mockSuccess();
    mocks.resolveImageInput.mockImplementation(async (value: string) =>
      value.startsWith("/api/outputs/") ? "data:image/png;base64,LAMP" : value
    );
    const response = await post({
      mode: "precise",
      source: "data:image/png;base64,SRC",
      frame: { width: 400, height: 200 },
      settings: { aspectRatio: "16:9" },
      regions: [
        { id: "r1", x: 10, y: 20, width: 100, height: 80, action: "change", prompt: "a red scarf" },
        { id: "r2", x: 200, y: 20, width: 100, height: 80, action: "change", prompt: "a lamp", reference: "/api/outputs/lamp/image" },
        { id: "r3", x: 0, y: 100, width: 400, height: 100, action: "keep", prompt: "the floor" },
        { x: -5, y: 0, width: 4, height: 4, prompt: "invalid, dropped" }
      ]
    });
    expect(response.status).toBe(200);
    const payload = submitted()?.[3];
    expect(payload).toMatchObject({ images: ["SRC", "LAMP"], aspect_ratio: "auto" });
    expect(payload.prompt).toContain("In <ref_image_0>, place a red scarf <red_scarf_1> at the top left; add a lamp <lamp_1> from image 2 at the top.");
    expect(payload.prompt).toContain('"from":"ref_image_1"');
    expect(Object.keys(payload).sort()).toEqual(["aspect_ratio", "grounding", "images", "prompt", "resolution", "safety_tolerance"]);
  });

  it("edits a whole image by sending the source as the one image, and keeps the prompt BFL expanded it into", async () => {
    mockSuccess();
    const expanded = 'Make it night <sky_1>. [{"id":"sky_1"}]';
    mocks.bflJson.mockImplementation(async (method: string) =>
      method === "POST"
        ? { id: "f3i-1", polling_url: "https://poll.example/f3i-1", cost: 4 }
        : { status: "Ready", result: { sample: "https://images.example/f3i-1.png", prompt: expanded } }
    );
    const response = await post({ mode: "edit", prompt: "make it night", source: "data:image/png;base64,SRC" });
    expect(response.status).toBe(200);
    expect(submitted()?.[3]).toMatchObject({ prompt: "make it night", images: ["SRC"] });
    expect((await response.json()).flux3Image).toMatchObject({ mode: "edit", expandedPrompt: expanded });
  });

  it("stops on a final status that BFL sends with HTTP 503 instead of retrying the poll", async () => {
    mockSuccess();
    mocks.bflJson.mockImplementation(async (method: string) => {
      if (method === "POST") return { id: "f3i-1", polling_url: "https://poll.example/f3i-1", cost: 4 };
      throw Object.assign(new Error('BFL API 503: {"status":"Error"}'), { status: 503, data: { status: "Error" } });
    });
    const response = await post({ mode: "t2i", prompt: "fox" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await response.json())).toMatch(/FLUX generation failed/);
    expect(mocks.bflJson.mock.calls.filter(([method]) => method === "GET")).toHaveLength(1);
  });

  it("passes BFL's early-access refusal through to the caller", async () => {
    mockSuccess();
    mocks.bflJson.mockImplementation(async () => {
      throw new Error('BFL API 403: {"detail":"Your organization does not have access to this endpoint."}');
    });
    const response = await post({ mode: "t2i", prompt: "fox" });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await response.json())).toMatch(/does not have access/);
  });

  describe("request keys", () => {
    const paidSubmits = () => mocks.bflJson.mock.calls.filter(([method]) => method === "POST").length;
    // The early-access test above pauses the queue, as an auth refusal should.
    beforeEach(async () => {
      const { mutateQueueState } = await import("@/lib/queue/store");
      await mutateQueueState((state) => {
        state.paused = false;
        state.pauseReason = undefined;
      });
    });

    it("answers a resend with its key with the job the first send started, and pays once", async () => {
      mockSuccess();
      const first = await post({ mode: "t2i", prompt: "a fox once", wait: false }, "run-key-0001");
      const again = await post({ mode: "t2i", prompt: "a fox once", wait: false }, "run-key-0001");
      const [one, two] = [await first.json(), await again.json()];
      expect(two).toMatchObject({ jobId: one.jobId, reused: true });
      await vi.waitFor(() => expect(mocks.saveOutputFiles).toHaveBeenCalled(), { timeout: 5_000 });
      expect(paidSubmits()).toBe(1);
    });

    it("gives a waiting resend the finished answer instead of running it again", async () => {
      mockSuccess();
      const first = await post({ mode: "t2i", prompt: "a fox waited for" }, "run-key-0002");
      expect(first.status).toBe(200);
      const again = await post({ mode: "t2i", prompt: "a fox waited for" }, "run-key-0002");
      expect(again.status).toBe(200);
      expect((await again.json()).flux3Image).toMatchObject({ mode: "t2i" });
      expect(paidSubmits()).toBe(1);
    });

    it("refuses the same key with a different prompt, and a malformed key, before anything is queued", async () => {
      mockSuccess();
      await post({ mode: "t2i", prompt: "a fox", wait: false }, "run-key-0003");
      await vi.waitFor(() => expect(mocks.saveOutputFiles).toHaveBeenCalled(), { timeout: 5_000 });
      const conflict = await post({ mode: "t2i", prompt: "an owl", wait: false }, "run-key-0003");
      expect(conflict.status).toBe(409);
      expect((await conflict.json()).error).toMatch(/already used for a different request/);
      const malformed = await post({ mode: "t2i", prompt: "a fox", wait: false }, "bad key!");
      expect(malformed.status).toBe(400);
      expect(paidSubmits()).toBe(1);
    });
  });
});
