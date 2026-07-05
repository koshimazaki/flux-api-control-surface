import { EventEmitter } from "node:events";
import https from "node:https";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareToolImageInput, prepareToolMaskInput, prepareVtoGarmentInput } from "@/lib/bfl-tool-inputs";
import {
  assertSafeRemoteImageUrl,
  fetchRemoteImageBuffer,
  isBlockedRemoteAddress,
  MAX_IMAGE_INPUT_BYTES,
  pinnedLookup
} from "@/lib/remote-image-fetch";

function dataUrl(buffer: Buffer, mime = "image/png") {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

const referenceAspectRatios = [
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
] as const;

// Stub https.request with a fake response so the pinned-fetch path is testable
// without real network I/O. Returns the spy plus the fake request/response.
function mockHttps(init: { statusCode: number; headers?: Record<string, string> }) {
  const response = Object.assign(new EventEmitter(), {
    statusCode: init.statusCode,
    headers: init.headers ?? {},
    destroy: () => {}
  });
  const request = Object.assign(new EventEmitter(), {
    setTimeout: () => {},
    end: () => {},
    destroy: () => {}
  });
  const spy = vi.spyOn(https, "request").mockImplementation(((_url: unknown, _opts: unknown, cb: (res: unknown) => void) => {
    queueMicrotask(() => cb(response));
    return request;
  }) as unknown as typeof https.request);
  return { spy, response, request };
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

  it("normalizes near-square screenshots to a square 1280px reference", async () => {
    const source = await sharp({
      create: {
        width: 3108,
        height: 3106,
        channels: 3,
        background: "#d8b05a"
      }
    })
      .png()
      .toBuffer();

    const prepared = await prepareToolImageInput(dataUrl(source), "reference image", {
      dimensionMultiple: 8,
      flattenBackground: "#ffffff",
      maxDimension: 1280,
      maxMegapixels: 4,
      targetAspectRatios: referenceAspectRatios
    });
    const metadata = await sharp(Buffer.from(prepared.base64, "base64")).metadata();

    expect(prepared).toMatchObject({ width: 1280, height: 1280 });
    expect(metadata).toMatchObject({ format: "png", width: 1280, height: 1280, channels: 3 });
    expect((metadata.width || 0) % 8).toBe(0);
    expect((metadata.height || 0) % 8).toBe(0);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("keeps clearly rectangular references rectangular while fitting them to 1280px", async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: "#456a9f"
      }
    })
      .png()
      .toBuffer();

    const prepared = await prepareToolImageInput(dataUrl(source), "reference image", {
      dimensionMultiple: 8,
      maxDimension: 1280,
      targetAspectRatios: referenceAspectRatios
    });

    expect(prepared).toMatchObject({ width: 1280, height: 720 });
  });

  it("snaps EXIF-oriented portrait references after applying orientation", async () => {
    const source = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: "#819f45"
      }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const prepared = await prepareToolImageInput(dataUrl(source, "image/jpeg"), "reference image", {
      dimensionMultiple: 8,
      maxDimension: 1280,
      targetAspectRatios: referenceAspectRatios
    });

    expect(prepared).toMatchObject({ width: 640, height: 1280 });
  });

  it("can encode normalized references as a metadata-free baseline JPEG", async () => {
    const source = await sharp({
      create: {
        width: 1025,
        height: 1023,
        channels: 4,
        background: { r: 40, g: 80, b: 120, alpha: 0.65 }
      }
    })
      .png()
      .toBuffer();

    const prepared = await prepareToolImageInput(dataUrl(source), "reference image", {
      dimensionMultiple: 8,
      flattenBackground: "#ffffff",
      imageFormat: "jpeg",
      jpegQuality: 95,
      maxDimension: 1280,
      targetAspectRatios: referenceAspectRatios
    });
    const metadata = await sharp(Buffer.from(prepared.base64, "base64")).metadata();

    expect(prepared).toMatchObject({ width: 1016, height: 1016 });
    expect(metadata).toMatchObject({ format: "jpeg", width: 1016, height: 1016, channels: 3 });
    expect(metadata.isProgressive).toBe(false);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("snaps broad references to the closest wide aspect bucket", async () => {
    const source = await sharp({
      create: {
        width: 2400,
        height: 1000,
        channels: 3,
        background: "#101820"
      }
    })
      .png()
      .toBuffer();

    const prepared = await prepareToolImageInput(dataUrl(source), "reference image", {
      dimensionMultiple: 8,
      maxDimension: 1280,
      targetAspectRatios: referenceAspectRatios
    });

    expect(prepared).toMatchObject({ width: 1280, height: 640 });
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

  it("blocks IPv4-mapped/compatible IPv6 in both dotted and normalized hex form (SSRF guard)", async () => {
    // The WHATWG URL parser normalizes [::ffff:127.0.0.1] to ::ffff:7f00:1, so a
    // dotted-only check would let loopback/metadata through an IPv6 literal.
    expect(isBlockedRemoteAddress("::ffff:127.0.0.1")).toBe(true); // dotted
    expect(isBlockedRemoteAddress("::ffff:7f00:1")).toBe(true); // 127.0.0.1, hex
    expect(isBlockedRemoteAddress("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254 metadata
    expect(isBlockedRemoteAddress("::1")).toBe(true); // loopback
    expect(isBlockedRemoteAddress("fe80::1")).toBe(true); // link-local
    expect(isBlockedRemoteAddress("fc00::1")).toBe(true); // unique-local
    expect(isBlockedRemoteAddress("::ffff:8.8.8.8")).toBe(false); // public mapped is allowed
    // End-to-end: the cloud-metadata endpoint via an IPv6-mapped literal must be refused.
    await expect(
      assertSafeRemoteImageUrl("https://[::ffff:169.254.169.254]/latest/meta-data/", { allowedHosts: [] })
    ).rejects.toThrow(/private or local/i);
  });

  it("pins the connection to the validated IP and enforces the response size cap", async () => {
    const { spy } = mockHttps({ statusCode: 200, headers: { "content-length": String(MAX_IMAGE_INPUT_BYTES + 1) } });

    await expect(fetchRemoteImageBuffer("https://8.8.8.8/image.png", "source image", { allowedHosts: [] })).rejects.toThrow(
      /input limit/
    );
    // Connection is pinned to the validated IP via lookup; SNI stays the host so
    // TLS still validates — this is what closes the DNS-rebinding TOCTOU.
    const [, opts] = spy.mock.calls[0] as unknown as [unknown, { servername?: string; lookup?: unknown }];
    expect(opts.servername).toBe("8.8.8.8");
    expect(typeof opts.lookup).toBe("function");
  });

  it("refuses redirects on the pinned fetch", async () => {
    mockHttps({ statusCode: 302, headers: { location: "https://evil.example.com/" } });
    await expect(fetchRemoteImageBuffer("https://8.8.8.8/image.png", "source image", { allowedHosts: [] })).rejects.toThrow(
      /redirects are not followed/
    );
  });

  it("assertSafeRemoteImageUrl returns the validated address list to pin the socket to", async () => {
    const result = await assertSafeRemoteImageUrl("https://8.8.8.8/image.png", { allowedHosts: [] });
    expect(result.addresses).toEqual(["8.8.8.8"]);
    expect(result.url.href).toBe("https://8.8.8.8/image.png");
  });

  it("pinnedLookup returns only the validated addresses regardless of the requested hostname", () => {
    // Two validated addresses (dual-stack) so fallback is preserved while pinned.
    const lookup = pinnedLookup(["203.0.113.7", "198.51.100.9"]);
    // all: true convention -> the full validated list (Happy-Eyeballs fallback).
    const all = vi.fn();
    lookup("attacker-rebind.example.com", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [
      { address: "203.0.113.7", family: 4 },
      { address: "198.51.100.9", family: 4 }
    ]);
    // net.connect single-address convention -> the first validated address.
    const single = vi.fn();
    lookup("attacker-rebind.example.com", {}, single);
    expect(single).toHaveBeenCalledWith(null, "203.0.113.7", 4);
    // legacy callback-as-second-arg convention.
    const legacy = vi.fn();
    lookup("attacker-rebind.example.com", legacy);
    expect(legacy).toHaveBeenCalledWith(null, "203.0.113.7", 4);
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
