import sharp from "sharp";
import { normalizeImageInput } from "./bfl-server";
import {
  assertImageBufferLimit,
  fetchRemoteImageBuffer,
  MAX_IMAGE_INPUT_BYTES,
  MAX_IMAGE_INPUT_PIXELS
} from "./remote-image-fetch";

type PreparedImage = {
  base64: string;
  width: number;
  height: number;
};

type PreparedGarment = PreparedImage & {
  count: number;
  composite: boolean;
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function bufferFromHttpUrl(url: string, label: string) {
  return fetchRemoteImageBuffer(url, label);
}

function estimatedBase64Bytes(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function bufferFromBase64(value: string, label: string) {
  const normalized = normalizeImageInput(value)?.replace(/\s/g, "") || "";
  if (!normalized) throw new Error(`Missing ${label}.`);
  if (estimatedBase64Bytes(normalized) > MAX_IMAGE_INPUT_BYTES) {
    throw new Error(`${label} exceeds the ${Math.ceil(MAX_IMAGE_INPUT_BYTES / (1024 * 1024))}MB input limit.`);
  }
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) throw new Error(`Invalid ${label}.`);
  assertImageBufferLimit(buffer, label);
  return buffer;
}

async function inputToBuffer(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(`Missing ${label}.`);
  return isHttpUrl(trimmed) ? bufferFromHttpUrl(trimmed, label) : bufferFromBase64(trimmed, label);
}

function imageInputError(label: string, error: unknown) {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return new Error(`Invalid or unsupported ${label}.${detail}`);
}

export async function prepareToolImageInput(value: string | undefined, label = "source") {
  try {
    const buffer = await inputToBuffer(value, label);
    const { data, info } = await sharp(buffer, { failOn: "none", limitInputPixels: MAX_IMAGE_INPUT_PIXELS })
      .rotate()
      .png()
      .toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) throw new Error("Could not read dimensions.");
    return {
      base64: data.toString("base64"),
      width: info.width,
      height: info.height
    } satisfies PreparedImage;
  } catch (error) {
    throw imageInputError(label, error);
  }
}

export async function prepareToolMaskInput(
  value: string | undefined,
  target: { width: number; height: number },
  label = "mask"
) {
  try {
    const buffer = await inputToBuffer(value, label);
    // Normalize to a 1-channel white-on-black mask (BFL tools: white = edit,
    // black = keep) and read it back raw so we can measure how much of the image
    // is actually marked for replacement.
    const { data, info } = await sharp(buffer, { failOn: "none", limitInputPixels: MAX_IMAGE_INPUT_PIXELS })
      .rotate()
      .resize(target.width, target.height, { fit: "fill" })
      .flatten({ background: "#000000" })
      .greyscale()
      .threshold(8)
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== target.width || info.height !== target.height) {
      throw new Error(`Mask dimensions ${info.width}x${info.height} do not match source ${target.width}x${target.height}.`);
    }
    let whitePixels = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i] >= 128) whitePixels += 1;
    }
    const pixelCount = info.width * info.height;
    const coverage = pixelCount > 0 ? whitePixels / pixelCount : 0;
    const png = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: info.channels }
    })
      .png()
      .toBuffer();
    return {
      base64: png.toString("base64"),
      width: info.width,
      height: info.height,
      coverage
    };
  } catch (error) {
    throw imageInputError(label, error);
  }
}

export async function prepareVtoGarmentInput(values: string[]) {
  const inputs = values.map((value) => value.trim()).filter(Boolean).slice(0, 4);
  if (!inputs.length) throw new Error("Missing garment reference.");

  const prepared = await Promise.all(
    inputs.map((value, index) => prepareToolImageInput(value, `garment image ${index + 1}`))
  );
  if (prepared.length === 1) {
    return {
      ...prepared[0],
      count: 1,
      composite: false
    } satisfies PreparedGarment;
  }

  // BFL VTO accepts one garment image. The UI exposes up to four slots as
  // staging, then composites them into the single documented garment payload.
  const canvasSize = 1024;
  const columns = 2;
  const rows = Math.ceil(prepared.length / columns);
  const gutter = 32;
  const cellWidth = Math.floor((canvasSize - gutter * (columns + 1)) / columns);
  const cellHeight = Math.floor((canvasSize - gutter * (rows + 1)) / rows);
  const composites = await Promise.all(
    prepared.map(async (image, index) => {
      const buffer = await sharp(Buffer.from(image.base64, "base64"), {
        failOn: "none",
        limitInputPixels: MAX_IMAGE_INPUT_PIXELS
      })
        .flatten({ background: "#f8f8f5" })
        .resize(cellWidth, cellHeight, {
          fit: "contain",
          background: "#f8f8f5"
        })
        .png()
        .toBuffer();
      return {
        input: buffer,
        left: gutter + (index % columns) * (cellWidth + gutter),
        top: gutter + Math.floor(index / columns) * (cellHeight + gutter)
      };
    })
  );

  const { data, info } = await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 3,
      background: "#f8f8f5"
    }
  })
    .composite(composites)
    .png()
    .toBuffer({ resolveWithObject: true });

  return {
    base64: data.toString("base64"),
    width: info.width,
    height: info.height,
    count: prepared.length,
    composite: true
  } satisfies PreparedGarment;
}
