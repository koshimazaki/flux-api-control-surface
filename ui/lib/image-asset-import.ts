import type { AssetKind, AssetRecord } from "@/lib/types";

type ImageAssetOptions = {
  assetKind?: AssetKind;
  id?: string;
  name?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  payload?: Record<string, unknown>;
  sourceAssetId?: string | null;
  operation?: string | null;
};

type ImageSourceOptions = ImageAssetOptions & {
  imageDataUrl?: string;
  imageUrl?: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
};

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|avif)$/i;

export function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_EXTENSION_PATTERN.test(file.name);
}

export function imageFilesFromList(files: File[] | FileList | null | undefined) {
  return Array.from(files || []).filter(isImageFile);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function measureImage(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromName(name?: string) {
  const clean = (name || "Imported image").replace(/\.[^.]+$/, "");
  return clean || name || "Imported image";
}

function modelForKind(kind: AssetKind) {
  if (kind === "reference") return "reference-image";
  if (kind === "input") return "local-input";
  if (kind === "asset") return "local-asset";
  return "imported-output";
}

export async function assetFromImageSource(options: ImageSourceOptions): Promise<AssetRecord> {
  const timestamp = Date.now();
  const kind = options.assetKind || "input";
  const title = titleFromName(options.name);
  const imageDataUrl = options.imageDataUrl || "";
  const imageUrl = options.imageUrl || imageDataUrl;
  const source = imageDataUrl || imageUrl;
  const sizeToken = options.size ? `-${options.size}` : "";
  const modifiedToken = options.lastModified ? `-${options.lastModified}` : "";
  const id =
    options.id ||
    `${kind}-${slugify(`${options.name || title}${sizeToken}${modifiedToken}`) || timestamp}`;
  const measured = await measureImage(source);

  return {
    id,
    title,
    createdAt: new Date(timestamp).toISOString(),
    timestamp,
    imageDataUrl,
    imageUrl,
    image_url: imageUrl,
    sampleUrl: imageUrl,
    model: options.model || modelForKind(kind),
    prompt: options.prompt || "",
    status: "complete",
    width: measured?.width,
    height: measured?.height,
    aspectRatio: measured ? `${measured.width}:${measured.height}` : undefined,
    provider: options.provider || "local-file",
    payload: {
      source: "image-import",
      name: options.name || title,
      mimeType: options.mimeType,
      size: options.size,
      lastModified: options.lastModified,
      ...options.payload
    },
    references: [],
    sourceAssetId: options.sourceAssetId ?? null,
    operation: options.operation ?? null,
    assetKind: kind
  };
}

export async function assetFromImageFile(file: File, options: ImageAssetOptions = {}) {
  return assetFromImageSource({
    ...options,
    name: options.name || file.name,
    imageDataUrl: await readFileAsDataUrl(file),
    mimeType: file.type,
    size: file.size,
    lastModified: file.lastModified
  });
}
