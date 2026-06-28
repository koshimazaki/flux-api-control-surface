import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareToolImageInput, prepareToolMaskInput, prepareVtoGarmentInput } from "@/lib/bfl-tool-inputs";
import {
  assertSafeRemoteImageUrl,
  fetchRemoteImageBuffer,
  isBlockedRemoteAddress,
  MAX_IMAGE_INPUT_BYTES
} from "@/lib/remote-image-fetch";

function dataUrl(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

describe("BFL tool input preparation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("re-encodes a source image as clean PNG base64", async () => {
    const source = await sharp({
      create: {
        width: 8,
        height: 4,
        channels: 3,
        background: "#8844ff"
      }
    })
      .jpeg()
      .toBuffer();

    const prepared = await prepareToolImageInput(dataUrl(source, "image/jpeg"), "source image");
    const metadata = await sharp(Buffer.from(prepared.base64, "base64")).metadata();

    expect(prepared).toMatchObject({ width: 8, height: 4 });
    expect(metadata).toMatchObject({ format: "png", width: 8, height: 4 });
  });

  it("resizes and thresholds masks to match the source image dimensions", async () => {
    const mask = await sharp(Buffer.from(`<svg width="4" height="2">
      <rect width="4" height="2" fill="black"/>
      <rect x="1" y="0" width="2" height="2" fill="white"/>
    </svg>`))
      .png()
      .toBuffer();

    const prepared = await prepareToolMaskInput(dataUrl(mask), { width: 8, height: 4 }, "mask");
    const { data, info } = await sharp(Buffer.from(prepared.base64, "base64"))
      .raw()
      .toBuffer({ resolveWithObject: true });
    const values = new Set(data);

    expect(prepared).toMatchObject({ width: 8, height: 4 });
    expect(info).toMatchObject({ width: 8, height: 4 });
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it("rejects invalid image bytes before BFL sees them", async () => {
    await expect(prepareToolImageInput("not-image-bytes", "source image")).rejects.toThrow(
      /Invalid or unsupported source image/
    );
  });

  it("rejects private and local remote image addresses before fetch", async () => {
    expect(isBlockedRemoteAddress("127.0.0.1")).toBe(true);
    expect(isBlockedRemoteAddress("10.0.0.12")).toBe(true);
    expect(isBlockedRemoteAddress("169.254.169.254")).toBe(true);
    expect(isBlockedRemoteAddress("8.8.8.8")).toBe(false);
    await expect(assertSafeRemoteImageUrl("http://8.8.8.8/image.png", { allowedHosts: [] })).rejects.toThrow(/https/i);
    await expect(assertSafeRemoteImageUrl("https://127.0.0.1/image.png", { allowedHosts: [] })).rejects.toThrow(
      /private or local/i
    );
  });

  it("fetches remote inputs without redirects and enforces response size caps", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", {
        status: 200,
        headers: { "content-length": String(MAX_IMAGE_INPUT_BYTES + 1) }
      })
    );

    await expect(fetchRemoteImageBuffer("https://8.8.8.8/image.png", "source image", { allowedHosts: [] })).rejects.toThrow(
      /input limit/
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://8.8.8.8/image.png",
      expect.objectContaining({ cache: "no-store", redirect: "manual" })
    );
  });

  it("composes multiple VTO garments onto one clean reference canvas", async () => {
    const top = await sharp({
      create: {
        width: 64,
        height: 96,
        channels: 3,
        background: "#244cff"
      }
    }).png().toBuffer();
    const bottom = await sharp({
      create: {
        width: 80,
        height: 64,
        channels: 3,
        background: "#f2d04d"
      }
    }).png().toBuffer();

    const garment = await prepareVtoGarmentInput([dataUrl(top), dataUrl(bottom)]);
    const metadata = await sharp(Buffer.from(garment.base64, "base64")).metadata();

    expect(garment).toMatchObject({ count: 2, composite: true, width: 1024, height: 1024 });
    expect(metadata).toMatchObject({ format: "png", width: 1024, height: 1024 });
  });
});
