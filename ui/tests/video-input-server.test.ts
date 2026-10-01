import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFlux3: vi.fn(),
  findUpscale: vi.fn(),
  findEdit: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/lib/flux3-video-server", () => ({ findFlux3VideoOutput: mocks.findFlux3 }));
vi.mock("@/lib/video-upscale-server", () => ({ findVideoUpscaleOutput: mocks.findUpscale }));
vi.mock("@/lib/video-edit-server", () => ({ findVideoEditOutput: mocks.findEdit }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));

const { localVideoPointer, resolveVideoInput } = await import("@/lib/video-input-server");

const ORIGIN = "http://localhost:3017";

describe("shared video input resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readFile.mockResolvedValue(Buffer.from("bytes"));
  });

  it("decodes data URLs without touching disk", async () => {
    const resolved = await resolveVideoInput("data:video/mp4;base64,c291cmNl");
    expect(resolved).toEqual({ buffer: Buffer.from("source"), contentType: "video/mp4", sourceName: "source.mp4" });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("recognizes every local playback URL, including the source side of a comparison", () => {
    expect(localVideoPointer("/api/bfl/flux3-video/abc", ORIGIN)).toEqual({ kind: "flux3", id: "abc", source: false });
    expect(localVideoPointer("/api/bfl/video-upscale/u1?kind=source", ORIGIN)).toEqual({ kind: "upscale", id: "u1", source: true });
    expect(localVideoPointer(`${ORIGIN}/api/bfl/video-edit/e%201`, ORIGIN)).toEqual({ kind: "edit", id: "e 1", source: false });
    expect(localVideoPointer("https://elsewhere.example/api/bfl/video-edit/e1", ORIGIN)).toBeNull();
    expect(localVideoPointer("/api/outputs/x/image", ORIGIN)).toBeNull();
  });

  it("reads a saved edit from disk so a result can be edited again or upscaled", async () => {
    mocks.findEdit.mockResolvedValue({ filePath: "/outputs/edit.mp4", contentType: "video/mp4", fileName: "clip.edited.mp4" });
    const resolved = await resolveVideoInput("/api/bfl/video-edit/e1", ORIGIN);
    expect(mocks.findEdit).toHaveBeenCalledWith("e1", "video");
    expect(mocks.readFile).toHaveBeenCalledWith("/outputs/edit.mp4");
    expect(resolved).toEqual({ buffer: Buffer.from("bytes"), contentType: "video/mp4", sourceName: "clip.edited.mp4" });
  });

  it("reads the preserved source of an upscale when asked for it", async () => {
    mocks.findUpscale.mockResolvedValue({ filePath: "/outputs/up.source.mp4", contentType: "video/mp4", fileName: "up.source.mp4" });
    await resolveVideoInput("/api/bfl/video-upscale/u1?kind=source", ORIGIN);
    expect(mocks.findUpscale).toHaveBeenCalledWith("u1", "source");
  });

  it("explains a missing local clip instead of submitting nothing", async () => {
    mocks.findFlux3.mockResolvedValue(null);
    await expect(resolveVideoInput("/api/bfl/flux3-video/gone", ORIGIN)).rejects.toThrow(/no longer available/i);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
