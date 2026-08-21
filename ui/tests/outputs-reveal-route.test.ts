import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/outputs/reveal/route";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(
    (_command: string, _args: string[], callback: (error: Error | null) => void) => callback(null)
  ),
  findImage: vi.fn(),
  findVideo: vi.fn(),
  findUpscale: vi.fn()
}));

vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("@/lib/server-output-store", () => ({ findLocalOutputImage: mocks.findImage }));
vi.mock("@/lib/flux3-video-server", () => ({ findFlux3VideoOutput: mocks.findVideo }));
vi.mock("@/lib/video-upscale-server", () => ({ findVideoUpscaleOutput: mocks.findUpscale }));

const OUTPUTS = path.resolve(process.cwd(), "..", "outputs");
const IMAGE_PATH = path.join(OUTPUTS, "flux-api-control-surface", "2026-08-05", "flower.png");
const VIDEO_PATH = path.join(OUTPUTS, "flux-api-control-surface", "video", "2026-08-05", "clip.mp4");

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

function revealRequest(body: unknown) {
  return new NextRequest("http://localhost/api/outputs/reveal", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

afterEach(() => {
  setPlatform(originalPlatform);
  vi.clearAllMocks();
});

describe("POST /api/outputs/reveal", () => {
  it("rejects a missing id", async () => {
    const response = await POST(revealRequest({}));
    expect(response.status).toBe(400);
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("returns 404 when no local file backs the asset", async () => {
    mocks.findImage.mockResolvedValue(null);
    mocks.findVideo.mockResolvedValue(null);
    mocks.findUpscale.mockResolvedValue(null);
    const response = await POST(revealRequest({ id: "remote-only" }));
    expect(response.status).toBe(404);
    expect(mocks.execFile).not.toHaveBeenCalled();
  });

  it("reveals an image with Finder on macOS", async () => {
    setPlatform("darwin");
    mocks.findImage.mockResolvedValue({ imagePath: IMAGE_PATH });
    const response = await POST(revealRequest({ id: "img-1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, fileName: "flower.png" });
    expect(mocks.execFile).toHaveBeenCalledWith("open", ["-R", IMAGE_PATH], expect.any(Function));
  });

  it("falls back to the FLUX 3 video resolver", async () => {
    setPlatform("darwin");
    mocks.findImage.mockResolvedValue(null);
    mocks.findVideo.mockResolvedValue({ filePath: VIDEO_PATH });
    const response = await POST(revealRequest({ id: "vid-1" }));
    expect(response.status).toBe(200);
    expect(mocks.execFile).toHaveBeenCalledWith("open", ["-R", VIDEO_PATH], expect.any(Function));
  });

  it("reveals a saved Video Upscale result", async () => {
    setPlatform("darwin");
    mocks.findImage.mockResolvedValue(null);
    mocks.findVideo.mockResolvedValue(null);
    mocks.findUpscale.mockResolvedValue({ filePath: VIDEO_PATH });
    const response = await POST(revealRequest({ id: "upscale-1" }));
    expect(response.status).toBe(200);
    expect(mocks.execFile).toHaveBeenCalledWith("open", ["-R", VIDEO_PATH], expect.any(Function));
  });

  it("refuses to reveal a resolved path outside the outputs workspace", async () => {
    setPlatform("darwin");
    mocks.findImage.mockResolvedValue({ imagePath: "/etc/passwd" });
    const response = await POST(revealRequest({ id: "escape" }));
    expect(response.status).toBe(400);
    expect(mocks.execFile).not.toHaveBeenCalled();
  });
});
