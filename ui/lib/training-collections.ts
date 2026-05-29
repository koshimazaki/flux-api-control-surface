import { extensionForAsset } from "./dashboard-assets";
import type { AssetRecord, TrainingCollection, TrainingCollectionItem } from "./types";

export const TRAINING_COLLECTIONS_KEY = "bfl-training-collections";

export const defaultCaptionGuide =
  "Caption for LoRA training. Use one concise descriptive sentence. Start with the trigger token. Describe visible subject, anatomy, material, color, pose, background, and lighting. Avoid hype, model names, file names, watermarks, camera metadata, and invisible prompt-only details.";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function parsePrompt(raw?: string) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function compactText(value: unknown) {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).filter(Boolean).join(", ");
  return String(value);
}

export function createTrainingCollection(name = "LoRA collection"): TrainingCollection {
  const now = Date.now();
  return {
    id: uniqueId("collection"),
    name,
    triggerToken: "bfl_cyberflower",
    captionGuide: defaultCaptionGuide,
    createdAt: now,
    updatedAt: now,
    items: []
  };
}

export function captionFromPrompt(asset: AssetRecord, triggerToken: string) {
  const parsed = parsePrompt(asset.prompt);
  const subject = parsed?.subjects?.[0];
  const pieces = [
    triggerToken,
    compactText(subject?.description || parsed?.scene || asset.title),
    compactText(parsed?.materials),
    compactText(parsed?.lighting),
    compactText(parsed?.environment)
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();

  return pieces || `${triggerToken}, cybernetic botanical specimen`;
}

export function collectionItemFromAsset(asset: AssetRecord, triggerToken: string): TrainingCollectionItem {
  const extension = extensionForAsset(asset);
  return {
    id: `asset_${asset.id}`,
    source: "asset",
    name: asset.title || asset.id,
    fileName: `${slugify(asset.title || asset.id || "asset") || "asset"}.${extension}`,
    imageDataUrl: asset.imageDataUrl,
    mimeType: asset.imageDataUrl.match(/^data:([^;]+);/)?.[1] || `image/${extension === "jpg" ? "jpeg" : extension}`,
    prompt: asset.prompt,
    caption: captionFromPrompt(asset, triggerToken),
    assetId: asset.id,
    addedAt: Date.now()
  };
}

export async function collectionItemFromFile(file: File, triggerToken: string): Promise<TrainingCollectionItem> {
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  return {
    id: uniqueId("file"),
    source: "file",
    name: file.name,
    fileName: file.name,
    imageDataUrl,
    mimeType: file.type || "image/png",
    caption: `${triggerToken}, `,
    addedAt: Date.now()
  };
}

function dataUrlToBytes(dataUrl: string) {
  const [, meta = "", payload = ""] = dataUrl.match(/^data:([^,]+),(.*)$/) || [];
  const isBase64 = meta.includes(";base64");
  if (!isBase64) return new TextEncoder().encode(decodeURIComponent(payload));
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeU16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeU32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function dosTime(date: Date) {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date: Date) {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function sanitizeZipName(value: string) {
  return value.replace(/^\/+/, "").replace(/\.\./g, "").replace(/[\\:]/g, "-");
}

export function captionInstructions(collection: TrainingCollection) {
  return `# Captioning Brief

Collection: ${collection.name}
Trigger token: ${collection.triggerToken}

${collection.captionGuide}

For each numbered image, write the matching numbered .txt file. Keep the filename stem identical to the image stem. Prefer visually grounded descriptions over prompt reconstruction.`;
}

export async function exportCollectionZip(collection: TrainingCollection) {
  const encoder = new TextEncoder();
  const entries: Array<{ name: string; bytes: Uint8Array }> = [
    {
      name: "manifest.json",
      bytes: encoder.encode(JSON.stringify(collection, null, 2))
    },
    {
      name: "captioning_instructions.md",
      bytes: encoder.encode(captionInstructions(collection))
    }
  ];

  collection.items.forEach((item, index) => {
    const number = String(index + 1).padStart(2, "0");
    const ext = item.fileName.split(".").pop()?.toLowerCase() || "png";
    const baseName = `${number}_${slugify(item.name || item.fileName || "image") || "image"}`;
    entries.push({
      name: `images/${baseName}.${ext}`,
      bytes: dataUrlToBytes(item.imageDataUrl)
    });
    entries.push({
      name: `captions/${baseName}.txt`,
      bytes: encoder.encode(item.caption.trim() || `${collection.triggerToken}, `)
    });
  });

  const now = new Date();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const name = encoder.encode(sanitizeZipName(entry.name));
    const checksum = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    writeU32(local, 0, 0x04034b50);
    writeU16(local, 4, 20);
    writeU16(local, 6, 0);
    writeU16(local, 8, 0);
    writeU16(local, 10, dosTime(now));
    writeU16(local, 12, dosDate(now));
    writeU32(local, 14, checksum);
    writeU32(local, 18, entry.bytes.length);
    writeU32(local, 22, entry.bytes.length);
    writeU16(local, 26, name.length);
    local.set(name, 30);
    localParts.push(local, entry.bytes);

    const central = new Uint8Array(46 + name.length);
    writeU32(central, 0, 0x02014b50);
    writeU16(central, 4, 20);
    writeU16(central, 6, 20);
    writeU16(central, 8, 0);
    writeU16(central, 10, 0);
    writeU16(central, 12, dosTime(now));
    writeU16(central, 14, dosDate(now));
    writeU32(central, 16, checksum);
    writeU32(central, 20, entry.bytes.length);
    writeU32(central, 24, entry.bytes.length);
    writeU16(central, 28, name.length);
    writeU32(central, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + entry.bytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  writeU32(end, 0, 0x06054b50);
  writeU16(end, 8, entries.length);
  writeU16(end, 10, entries.length);
  writeU32(end, 12, centralSize);
  writeU32(end, 16, offset);

  const blobParts: BlobPart[] = [...localParts, ...centralParts, end].map(
    (part) => part.slice().buffer as ArrayBuffer
  );
  const zip = new Blob(blobParts, { type: "application/zip" });
  const url = URL.createObjectURL(zip);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(collection.name) || "bfl-training-collection"}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
