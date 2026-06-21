import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareToolImageInput, prepareToolMaskInput } from "@/lib/bfl-tool-inputs";

function dataUrl(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

describe("BFL tool input preparation", () => {
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
});
