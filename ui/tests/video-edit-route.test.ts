import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/bfl/video-edit/route";

const mocks = vi.hoisted(() => ({
  bflJson: vi.fn(),
  downloadVideoBinary: vi.fn(),
  getCredits: vi.fn(),
  resolveApiKey: vi.fn(),
  resolveVideoInput: vi.fn(),
  saveVideoEditOutput: vi.fn()
}));

vi.mock("@/lib/bfl-server", () => ({
  BFL_API_BASE: "https://api.bfl.ai/v1",
  bflJson: mocks.bflJson,
  getCredits: mocks.getCredits,
  patchOutputMetadataFile: vi.fn().mockResolvedValue(true),
  resolveApiKey: mocks.resolveApiKey
}));

vi.mock("@/lib/video-input-server", () => ({
  downloadVideoBinary: mocks.downloadVideoBinary,
  resolveVideoInput: mocks.resolveVideoInput
}));

vi.mock("@/lib/video-edit-server", () => ({
  findVideoEditOutput: vi.fn(),
  listVideoEditOutputs: vi.fn().mockResolvedValue([]),
  saveVideoEditOutput: mocks.saveVideoEditOutput
}));

function editRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/bfl/video-edit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("FLUX Video Edit route", () => {
  afterEach(() => vi.clearAllMocks());

  it("submits the documented endpoint and saves source plus edited result", async () => {
    mocks.resolveApiKey.mockResolvedValue("secret-key");
    mocks.getCredits.mockResolvedValueOnce(1000).mockResolvedValueOnce(970);
    mocks.resolveVideoInput.mockResolvedValue({
      buffer: Buffer.from("source-video"),
      contentType: "video/mp4",
      sourceName: "harbor.mp4"
    });
    mocks.bflJson.mockImplementation(async (method: string) => method === "POST"
      ? { id: "edit-job-1", polling_url: "https://poll.example/edit", cost: 30 }
      : { status: "Ready", result: { sample: "https://delivery.example/edited.mp4" } });
    mocks.downloadVideoBinary.mockResolvedValue({ buffer: Buffer.from("edited-video"), contentType: "video/mp4" });
    mocks.saveVideoEditOutput.mockResolvedValue({
      result: {
        id: "edit-job-1",
        title: "harbor.mp4 · Remove the orange bucket.",
        prompt: "Remove the orange bucket.",
        createdAt: "2026-09-10T00:00:00.000Z",
        sourceVideoUrl: "/api/bfl/video-edit/edit-job-1?kind=source",
        videoUrl: "/api/bfl/video-edit/edit-job-1",
        safetyTolerance: 2
      },
      outputFiles: { sourceVideoPath: "outputs/source.mp4", videoPath: "outputs/edited.mp4" }
    });

    const response = await POST(editRequest({
      inputVideo: "data:video/mp4;base64,c291cmNl",
      title: "harbor.mp4 · Remove the orange bucket.",
      prompt: "Remove the orange bucket.",
      safetyTolerance: 2,
      sourceWidth: 1280,
      sourceHeight: 720,
      durationSeconds: 10
    }));

    expect(response.status).toBe(200);
    const submit = mocks.bflJson.mock.calls.find(([method]) => method === "POST");
    expect(submit).toBeTruthy();
    const [, url, apiKey, payload] = submit as [string, string, string, Record<string, unknown>];
    expect(url).toBe("https://api.bfl.ai/v1/flux-tools/video-edit-v1");
    expect(apiKey).toBe("secret-key");
    // The documented request has exactly these three fields; anything else is a 422.
    expect(payload).toEqual({
      video: Buffer.from("source-video").toString("base64"),
      prompt: "Remove the orange bucket.",
      safety_tolerance: 2
    });
    expect(mocks.saveVideoEditOutput).toHaveBeenCalledWith(expect.objectContaining({
      id: "edit-job-1",
      prompt: "Remove the orange bucket.",
      sourceBuffer: Buffer.from("source-video"),
      videoBuffer: Buffer.from("edited-video")
    }));
    await expect(response.json()).resolves.toMatchObject({
      id: "edit-job-1",
      videoUrl: "/api/bfl/video-edit/edit-job-1"
    });
  });

  it("rejects an empty instruction before anything is submitted", async () => {
    mocks.resolveApiKey.mockResolvedValue("secret-key");
    mocks.getCredits.mockResolvedValue(1000);
    mocks.resolveVideoInput.mockResolvedValue({
      buffer: Buffer.from("source-video"),
      contentType: "video/mp4",
      sourceName: "harbor.mp4"
    });

    const response = await POST(editRequest({ inputVideo: "data:video/mp4;base64,c291cmNl", prompt: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/describe the change/i) });
    expect(mocks.bflJson).not.toHaveBeenCalled();
    expect(mocks.saveVideoEditOutput).not.toHaveBeenCalled();
  });
});
