import sharp from "sharp";
import { normalizeImageInput } from "./bfl-server";

type PreparedImage = {
  base64: string;
  width: number;
  height: number;
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function bufferFromHttpUrl(url: string, label: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not fetch ${label}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function bufferFromBase64(value: string, label: string) {
  const normalized = normalizeImageInput(value)?.replace(/\s/g, "") || "";
  if (!normalized) throw new Error(`Missing ${label}.`);
  const buffer = Buffer.from(normalized, "base64");
  if (!buffer.length) throw new Error(`Invalid ${label}.`);
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
    const { data, info } = await sharp(buffer, { failOn: "none" })
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
    const { data, info } = await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(target.width, target.height, { fit: "fill" })
      .flatten({ background: "#000000" })
      .greyscale()
      .threshold(8)
      .png()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== target.width || info.height !== target.height) {
      throw new Error(`Mask dimensions ${info.width}x${info.height} do not match source ${target.width}x${target.height}.`);
    }
    return {
      base64: data.toString("base64"),
      width: info.width,
      height: info.height
    } satisfies PreparedImage;
  } catch (error) {
    throw imageInputError(label, error);
  }
}
