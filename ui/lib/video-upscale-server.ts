import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "@/lib/bfl-server";
import { findFlux3VideoOutput } from "@/lib/flux3-video-server";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import type { VideoUpscaleCreativity, VideoUpscaleResult } from "@/lib/video-upscale";

export const VIDEO_UPSCALE_OUTPUT_ROOT = path.resolve(
  process.cwd(),
  "..",
  "outputs",
  "flux-api-control-surface",
  "video-upscale"
);

type SavedVideoUpscaleMetadata = {
  id: string;
  title: string;
  prompt: string;
  model: "flux-tools-video-upscale-v1";
  createdAt: string;
  upscaleFactor: number;
  creativity: VideoUpscaleCreativity;
  safetyTolerance: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
  outputWidth?: number;
  outputHeight?: number;
  estimatedUsd?: number | null;
  sourceAssetId?: string | null;
  sourceName?: string;
  submit?: Record<string, any>;
  outputSourceFileName: string;
  outputFileName: string;
  outputFiles?: Record<string, unknown>;
};

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
    }))).flat();
  } catch {
    return [];
  }
}

function videoContentType(filePath: string) {
  if (filePath.endsWith(".webm")) return "video/webm";
  if (filePath.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function videoExtension(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  return "mp4";
}

function resultFromMetadata(metadata: SavedVideoUpscaleMetadata): VideoUpscaleResult {
  return {
    id: metadata.id,
    title: metadata.title,
    prompt: metadata.prompt,
    createdAt: metadata.createdAt,
    sourceVideoUrl: `/api/bfl/video-upscale/${encodeURIComponent(metadata.id)}?kind=source`,
    videoUrl: `/api/bfl/video-upscale/${encodeURIComponent(metadata.id)}`,
    upscaleFactor: metadata.upscaleFactor,
    creativity: metadata.creativity,
    safetyTolerance: metadata.safetyTolerance,
    sourceWidth: metadata.sourceWidth,
    sourceHeight: metadata.sourceHeight,
    durationSeconds: metadata.durationSeconds,
    outputWidth: metadata.outputWidth,
    outputHeight: metadata.outputHeight,
    estimatedUsd: metadata.estimatedUsd,
    costCredits: metadata.submit?.cost ?? null,
    creditsAfter: metadata.submit?.creditsAfter ?? null,
    sourceAssetId: typeof metadata.sourceAssetId === "string" ? metadata.sourceAssetId : null,
    outputFiles: metadata.outputFiles
  };
}

export async function downloadVideoBinary(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not download video: ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

function localVideoPointer(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    const flux3 = url.pathname.match(/^\/api\/bfl\/flux3-video\/([^/]+)$/);
    if (flux3) return { kind: "flux3" as const, id: decodeURIComponent(flux3[1]) };
    const upscale = url.pathname.match(/^\/api\/bfl\/video-upscale\/([^/]+)$/);
    if (upscale) return { kind: "upscale" as const, id: decodeURIComponent(upscale[1]), source: url.searchParams.get("kind") === "source" };
  } catch {
    return null;
  }
  return null;
}

export async function resolveVideoInput(value: string, origin = "http://localhost") {
  const trimmed = value.trim();
  const dataUrl = trimmed.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (dataUrl) {
    return { buffer: Buffer.from(dataUrl[2], "base64"), contentType: dataUrl[1], sourceName: "source.mp4" };
  }
  const pointer = localVideoPointer(trimmed, origin);
  if (pointer?.kind === "flux3") {
    const saved = await findFlux3VideoOutput(pointer.id);
    if (!saved) throw new Error("The selected FLUX 3 video is no longer available locally.");
    return { buffer: await readFile(saved.filePath), contentType: saved.contentType, sourceName: saved.fileName };
  }
  if (pointer?.kind === "upscale") {
    const saved = await findVideoUpscaleOutput(pointer.id, pointer.source ? "source" : "video");
    if (!saved) throw new Error("The selected upscale video is no longer available locally.");
    return { buffer: await readFile(saved.filePath), contentType: saved.contentType, sourceName: saved.fileName };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const downloaded = await downloadVideoBinary(trimmed);
    return { ...downloaded, sourceName: new URL(trimmed).pathname.split("/").pop() || "source.mp4" };
  }
  return { buffer: Buffer.from(trimmed, "base64"), contentType: "video/mp4", sourceName: "source.mp4" };
}

export async function saveVideoUpscaleOutput(options: {
  id: string;
  title: string;
  prompt: string;
  sourceBuffer: Buffer;
  sourceContentType: string;
  videoBuffer: Buffer;
  videoContentType: string;
  metadata: Omit<SavedVideoUpscaleMetadata, "outputSourceFileName" | "outputFileName" | "outputFiles"> & Record<string, unknown>;
}) {
  const createdAt = options.metadata.createdAt || new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const stamp = createdAt.replace(/[:.]/g, "-");
  const safeTitle = slugify(options.title) || "video-upscale";
  const safeId = slugify(options.id) || `${Date.now()}`;
  const baseName = `${stamp}_${safeTitle}_${safeId}`;
  const outputDir = path.join(VIDEO_UPSCALE_OUTPUT_ROOT, date);
  const sourceFileName = `${baseName}.source.${videoExtension(options.sourceContentType)}`;
  const outputFileName = `${baseName}.upscaled.${videoExtension(options.videoContentType)}`;
  const promptFileName = `${baseName}.prompt.txt`;
  const metadataFileName = `${baseName}.json`;
  await mkdir(outputDir, { recursive: true });
  const outputFiles = {
    sourceVideoPath: toWorkspaceRelativePath(path.join(outputDir, sourceFileName)),
    videoPath: toWorkspaceRelativePath(path.join(outputDir, outputFileName)),
    promptPath: toWorkspaceRelativePath(path.join(outputDir, promptFileName)),
    metadataPath: toWorkspaceRelativePath(path.join(outputDir, metadataFileName))
  };
  const metadata: SavedVideoUpscaleMetadata = {
    ...options.metadata,
    outputSourceFileName: sourceFileName,
    outputFileName,
    outputFiles
  };
  await Promise.all([
    writeFile(path.join(outputDir, sourceFileName), options.sourceBuffer),
    writeFile(path.join(outputDir, outputFileName), options.videoBuffer),
    writeFile(path.join(outputDir, promptFileName), options.prompt, "utf8"),
    writeFile(path.join(outputDir, metadataFileName), JSON.stringify(metadata, null, 2), "utf8")
  ]);
  return { result: resultFromMetadata(metadata), outputFiles };
}

async function readMetadataFiles() {
  const files = (await walk(VIDEO_UPSCALE_OUTPUT_ROOT)).filter((file) => file.endsWith(".json"));
  const items = await Promise.all(files.map(async (metadataPath) => {
    const [text, fileStat] = await Promise.all([readFile(metadataPath, "utf8"), stat(metadataPath)]);
    const metadata = JSON.parse(text) as SavedVideoUpscaleMetadata;
    if (metadata.model !== "flux-tools-video-upscale-v1" || !metadata.id || !metadata.outputFileName) return null;
    return { metadataPath, fileStat, metadata };
  }));
  return items.filter(Boolean).sort((a, b) => b!.fileStat.mtimeMs - a!.fileStat.mtimeMs) as Array<{
    metadataPath: string;
    fileStat: Awaited<ReturnType<typeof stat>>;
    metadata: SavedVideoUpscaleMetadata;
  }>;
}

export async function listVideoUpscaleOutputs(limit = 20) {
  return (await readMetadataFiles()).slice(0, Math.max(0, limit)).map(({ metadata }) => resultFromMetadata(metadata));
}

export async function findVideoUpscaleOutput(id: string, kind: "video" | "source" = "video") {
  const item = (await readMetadataFiles()).find(({ metadata }) => metadata.id === id);
  if (!item) return null;
  const fileName = kind === "source" ? item.metadata.outputSourceFileName : item.metadata.outputFileName;
  const filePath = path.join(path.dirname(item.metadataPath), fileName);
  return { filePath, contentType: videoContentType(filePath), fileName, metadata: item.metadata };
}
