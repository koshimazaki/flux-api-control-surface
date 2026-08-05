import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/bfl/flux3-video/route";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  downloadFlux3Binary: vi.fn(),
  getCredits: vi.fn(),
  pollResult: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveImageInput: vi.fn(),
  saveFlux3VideoOutput: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  getCredits: mocks.getCredits,
  pollResult: mocks.pollResult,
  resolveApiKey: mocks.resolveApiKey,
  resolveImageInput: mocks.resolveImageInput
}));

vi.mock("@/lib/flux3-video-server", () => ({
  downloadFlux3Binary: mocks.downloadFlux3Binary,
  findFlux3VideoOutput: vi.fn(),
  listFlux3VideoOutputs: vi.fn().mockResolvedValue([]),
  saveFlux3VideoOutput: mocks.saveFlux3VideoOutput
}));

function mockSuccess() {
  mocks.resolveApiKey.mockResolvedValue("secret-key");
  mocks.getCredits.mockResolvedValueOnce(1000).mockResolvedValueOnce(940);
  // The route now enqueues onto the server queue, which submits with POST and
  // then takes one poll step at a time with GET instead of a blocking loop.
  mocks.bflJson.mockImplementation(async (method: string) =>
    method === "POST"
      ? { id: "flux3-job-1", polling_url: "https://poll.example/1", cost: 60 }
      : { status: "Ready", result: { sample: "https://delivery.example/video.mp4" } }
  );
  mocks.pollResult.mockResolvedValue({ status: "Ready", result: { sample: "https://delivery.example/video.mp4" } });
  mocks.downloadFlux3Binary.mockResolvedValue({ buffer: Buffer.from("video"), contentType: "video/mp4" });
  mocks.saveFlux3VideoOutput.mockResolvedValue({
    result: {
      id: "flux3-job-1",
      title: "fox at dawn",
      prompt: "fox at dawn",
      mode: "t2v",
      videoUrl: "/api/bfl/flux3-video/flux3-job-1",
      createdAt: "2026-08-05T00:00:00.000Z",
      draft: true,
      draftCacheAvailable: false
    },
    outputFiles: { videoPath: "outputs/video.mp4" }
  });
}

describe("FLUX.3 video route", () => {
  afterEach(() => vi.clearAllMocks());

  it("submits, polls, downloads, and saves a text-to-video draft", async () => {
    mockSuccess();
    const response = await POST(
      new NextRequest("http://localhost/api/bfl/flux3-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "t2v", prompt: "fox at dawn", duration: 10, draft: true })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-3-video",
      "secret-key",
      expect.objectContaining({
        mode: "t2v",
        prompt: "fox at dawn",
        duration: 10,
        generate_audio: true,
        draft: true
      })
    );
    // One poll step against the stored polling URL, not a five-minute in-handler loop.
    expect(mocks.bflJson).toHaveBeenCalledWith("GET", "https://poll.example/1", "secret-key");
    expect(mocks.downloadFlux3Binary).toHaveBeenCalledWith("https://delivery.example/video.mp4");
    expect(mocks.saveFlux3VideoOutput).toHaveBeenCalledWith(
      expect.objectContaining({ id: "flux3-job-1", mode: "t2v", prompt: "fox at dawn" })
    );
    await expect(response.json()).resolves.toMatchObject({ id: "flux3-job-1", videoUrl: "/api/bfl/flux3-video/flux3-job-1" });
  });

  it("resolves dashboard image URLs before sending image keyframes", async () => {
    mockSuccess();
    mocks.resolveImageInput.mockResolvedValue("data:image/png;base64,prepared-frame");

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/flux3-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "i2v", prompt: "animate", keyframes: ["/api/outputs/frame/image"], duration: 8 })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveImageInput).toHaveBeenCalledWith("/api/outputs/frame/image", "http://localhost");
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-3-video",
      "secret-key",
      expect.objectContaining({ keyframes: ["prepared-frame"] })
    );
  });

  it("resolves the image half of timed [seconds, image] keyframes and keeps the timestamps", async () => {
    mockSuccess();
    mocks.resolveImageInput.mockImplementation(async (value: string) =>
      `data:image/png;base64,prepared-${value.split("/")[3]}`
    );

    const response = await POST(
      new NextRequest("http://localhost/api/bfl/flux3-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "i2v",
          prompt: "animate",
          timedKeyframes: [
            [0, "/api/outputs/one/image"],
            [4, "/api/outputs/two/image"]
          ],
          duration: 8
        })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-3-video",
      "secret-key",
      expect.objectContaining({
        keyframes: [
          [0, "prepared-one"],
          [4, "prepared-two"]
        ]
      })
    );
  });

  it("saves Video Script batch, row, prompt, collection, and timing provenance", async () => {
    mockSuccess();
    mocks.resolveImageInput.mockResolvedValue("data:image/png;base64,prepared-frame");

    await POST(
      new NextRequest("http://localhost/api/bfl/flux3-video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "i2v",
          prompt: "animate",
          timedKeyframes: [
            [0, "/api/outputs/frame/image"],
            [4, "/api/outputs/frame/image"]
          ],
          duration: 8,
          keyframeAssetIds: ["frame_a", "frame_b"],
          promptIds: ["vp_neon"],
          sourceCollectionIds: ["col_a"],
          batchId: "vsb_test",
          batchIndex: 2,
          batchTotal: 6,
          rowId: "kf_003"
        })
      })
    );

    expect(mocks.saveFlux3VideoOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          keyframeAssetIds: ["frame_a", "frame_b"],
          keyframeSeconds: [0, 4],
          promptIds: ["vp_neon"],
          sourceCollectionIds: ["col_a"],
          batchId: "vsb_test",
          batchIndex: 2,
          batchTotal: 6,
          rowId: "kf_003"
        })
      })
    );
    // Conditioning media never reaches saved metadata.
    const saved = mocks.saveFlux3VideoOutput.mock.calls[0][0] as { metadata: Record<string, any> };
    expect(saved.metadata.payload.keyframes).toBe("[2 image keyframes omitted]");
  });
});
