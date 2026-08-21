import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/bfl/video-upscale/route";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  downloadVideoBinary: vi.fn(),
  getCredits: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveVideoInput: vi.fn(),
  saveVideoUpscaleOutput: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  getCredits: mocks.getCredits,
  patchOutputMetadataFile: vi.fn().mockResolvedValue(true),
  resolveApiKey: mocks.resolveApiKey
}));

vi.mock("@/lib/video-upscale-server", () => ({
  downloadVideoBinary: mocks.downloadVideoBinary,
  findVideoUpscaleOutput: vi.fn(),
  listVideoUpscaleOutputs: vi.fn().mockResolvedValue([]),
  resolveVideoInput: mocks.resolveVideoInput,
  saveVideoUpscaleOutput: mocks.saveVideoUpscaleOutput
}));

describe("FLUX 3 Video Upscale route", () => {
  afterEach(() => vi.clearAllMocks());

  it("submits the documented endpoint and saves source plus result", async () => {
    mocks.resolveApiKey.mockResolvedValue("secret-key");
    mocks.getCredits.mockResolvedValueOnce(1000).mockResolvedValueOnce(930);
    mocks.resolveVideoInput.mockResolvedValue({
      buffer: Buffer.from("source-video"),
      contentType: "video/mp4",
      sourceName: "source.mp4"
    });
    mocks.bflJson.mockImplementation(async (method: string) => method === "POST"
      ? { id: "upscale-job-1", polling_url: "https://poll.example/upscale", cost: 70 }
      : { status: "Ready", result: { sample: "https://delivery.example/upscaled.mp4" } });
    mocks.downloadVideoBinary.mockResolvedValue({ buffer: Buffer.from("upscaled-video"), contentType: "video/mp4" });
    mocks.saveVideoUpscaleOutput.mockResolvedValue({
      result: {
        id: "upscale-job-1",
        title: "source.mp4 · 2×",
        prompt: "recover texture",
        createdAt: "2026-08-21T00:00:00.000Z",
        sourceVideoUrl: "/api/bfl/video-upscale/upscale-job-1?kind=source",
        videoUrl: "/api/bfl/video-upscale/upscale-job-1",
        upscaleFactor: 2,
        creativity: 0,
        safetyTolerance: 2
      },
      outputFiles: { sourceVideoPath: "outputs/source.mp4", videoPath: "outputs/upscaled.mp4" }
    });

    const response = await POST(new NextRequest("http://localhost/api/bfl/video-upscale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputVideo: "data:video/mp4;base64,c291cmNl",
        title: "source.mp4 · 2×",
        upscaleFactor: 2,
        creativity: 0,
        prompt: "recover texture",
        safetyTolerance: 2,
        sourceWidth: 1280,
        sourceHeight: 720,
        durationSeconds: 10
      })
    }));

    expect(response.status).toBe(200);
    expect(mocks.bflJson).toHaveBeenCalledWith(
      "POST",
      "https://api.bfl.ai/v1/flux-tools/video-upscale-v1",
      "secret-key",
      expect.objectContaining({
        input_video: Buffer.from("source-video").toString("base64"),
        upscale_factor: 2,
        creativity: 0,
        prompt: "recover texture",
        safety_tolerance: 2
      })
    );
    expect(mocks.saveVideoUpscaleOutput).toHaveBeenCalledWith(expect.objectContaining({
      id: "upscale-job-1",
      sourceBuffer: Buffer.from("source-video"),
      videoBuffer: Buffer.from("upscaled-video")
    }));
    await expect(response.json()).resolves.toMatchObject({
      id: "upscale-job-1",
      videoUrl: "/api/bfl/video-upscale/upscale-job-1"
    });
  });
});
