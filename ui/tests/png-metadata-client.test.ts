import { describe, expect, it } from "vitest";
import { assetFromPngMetadataFile } from "@/lib/png-asset-import";
import { extractBflPngMetadata } from "@/lib/png-metadata-client";
import { embedPngMetadata } from "@/lib/png-metadata";

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const minimalPng = Buffer.concat([
  pngSignature,
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("IEND", "ascii"),
  Buffer.from([0, 0, 0, 0])
]);

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

describe("PNG metadata client", () => {
  it("reads the BFL metadata chunks embedded in downloaded PNGs", () => {
    const metadata = {
      id: "request-123",
      model: "pro-preview",
      endpointName: "flux-2-pro-preview",
      sampleUrl: "https://example.com/output.png",
      payload: {
        prompt: "cybernetic orchid icon",
        width: 1024,
        height: 1024,
        seed: 77,
        output_format: "png"
      },
      runSettings: {
        title: "Icon batch"
      }
    };
    const withMetadata = embedPngMetadata(minimalPng, metadata);
    const parsed = extractBflPngMetadata(bufferToArrayBuffer(withMetadata));

    expect(parsed.prompt).toMatchObject({
      prompt: "cybernetic orchid icon",
      model: "pro-preview",
      requestId: "request-123"
    });
    expect(parsed.full).toMatchObject({
      id: "request-123",
      payload: {
        prompt: "cybernetic orchid icon",
        seed: 77
      }
    });
  });

  it("recreates a gallery asset from an imported metadata PNG", async () => {
    const metadata = {
      id: "request-456",
      model: "pro-preview",
      sampleUrl: "https://example.com/imported.png",
      payload: {
        prompt: "old generated flower icon",
        width: 768,
        height: 1024,
        seed: 12,
        output_format: "png"
      },
      submit: {
        cost: 2.25,
        creditsBefore: 10,
        creditsAfter: 7.75,
        creditDelta: 2.25
      },
      runSettings: {
        promptUpsampling: true
      }
    };
    const withMetadata = embedPngMetadata(minimalPng, metadata);
    const file = new File([bufferToArrayBuffer(withMetadata)], "old-icon.png", { type: "image/png", lastModified: 42 });
    const asset = await assetFromPngMetadataFile(file);

    expect(asset).toMatchObject({
      id: "request-456",
      title: "old-icon",
      model: "pro-preview",
      prompt: "old generated flower icon",
      width: 768,
      height: 1024,
      seed: 12,
      aspectRatio: "768:1024",
      costCredits: 2.25,
      creditsBefore: 10,
      creditsAfter: 7.75,
      creditDelta: 2.25
    });
    expect(asset.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(asset.payload.prompt).toBe("old generated flower icon");
    expect(asset.runSettings).toMatchObject({ promptUpsampling: true });
  });
});
