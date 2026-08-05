import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "@/lib/bfl-server";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import type { Flux3VideoMode, Flux3VideoResult } from "@/lib/flux3-video";

export const FLUX3_VIDEO_OUTPUT_ROOT = path.resolve(
  process.cwd(),
  "..",
  "outputs",
  "flux-api-control-surface",
  "video"
);

type SavedFlux3Metadata = {
  id: string;
  title: string;
  prompt: string;
  mode: Flux3VideoMode;
  model: "flux-3-video";
  createdAt: string;
  payload: Record<string, unknown>;
  submit?: Record<string, any>;
  outputFileName: string;
  outputDraftCacheFileName?: string | null;
  outputFiles?: Record<string, unknown>;
};

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries.map((entry) => {
          const fullPath = path.join(directory, entry.name);
          return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
        })
      )
    ).flat();
  } catch {
    return [];
  }
}

function videoExtension(contentType: string) {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  return "mp4";
}

function videoContentType(filePath: string) {
  if (filePath.endsWith(".webm")) return "video/webm";
  if (filePath.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function resultFromMetadata(metadata: SavedFlux3Metadata): Flux3VideoResult {
  return {
    id: metadata.id,
    title: metadata.title,
    prompt: metadata.prompt,
    mode: metadata.mode,
    videoUrl: `/api/bfl/flux3-video/${encodeURIComponent(metadata.id)}`,
    createdAt: metadata.createdAt,
    draft: Boolean(metadata.payload.draft),
    draftCacheAvailable: Boolean(metadata.outputDraftCacheFileName),
    resolution: metadata.payload.resolution as Flux3VideoResult["resolution"],
    duration: metadata.payload.duration as Flux3VideoResult["duration"],
    aspectRatio: metadata.payload.aspect_ratio as Flux3VideoResult["aspectRatio"],
    generateAudio: metadata.payload.generate_audio !== false,
    costCredits: metadata.submit?.cost ?? null,
    creditsAfter: metadata.submit?.creditsAfter ?? null,
    outputFiles: metadata.outputFiles
  };
}

export async function downloadFlux3Binary(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not download FLUX.3 output: ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

export async function saveFlux3VideoOutput(options: {
  id: string;
  title: string;
  prompt: string;
  mode: Flux3VideoMode;
  videoBuffer: Buffer;
  videoContentType: string;
  draftCacheBuffer?: Buffer | null;
  metadata: Omit<SavedFlux3Metadata, "outputFileName" | "outputDraftCacheFileName" | "outputFiles">;
}) {
  const createdAt = options.metadata.createdAt || new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const stamp = createdAt.replace(/[:.]/g, "-");
  const safeTitle = slugify(options.title) || "flux3-video";
  const safeId = slugify(options.id) || `${Date.now()}`;
  const baseName = `${stamp}_${safeTitle}_${safeId}`;
  const outputDir = path.join(FLUX3_VIDEO_OUTPUT_ROOT, date);
  const extension = videoExtension(options.videoContentType);
  const outputFileName = `${baseName}.${extension}`;
  const outputPromptFileName = `${baseName}.prompt.txt`;
  const outputMetadataFileName = `${baseName}.json`;
  const outputDraftCacheFileName = options.draftCacheBuffer ? `${baseName}.draft-cache.bin` : null;
  await mkdir(outputDir, { recursive: true });

  const outputFiles = {
    videoPath: toWorkspaceRelativePath(path.join(outputDir, outputFileName)),
    promptPath: toWorkspaceRelativePath(path.join(outputDir, outputPromptFileName)),
    metadataPath: toWorkspaceRelativePath(path.join(outputDir, outputMetadataFileName)),
    draftCachePath: outputDraftCacheFileName
      ? toWorkspaceRelativePath(path.join(outputDir, outputDraftCacheFileName))
      : null
  };
  const metadata: SavedFlux3Metadata = {
    ...options.metadata,
    outputFileName,
    outputDraftCacheFileName,
    outputFiles
  };

  const writes: Promise<unknown>[] = [
    writeFile(path.join(outputDir, outputFileName), options.videoBuffer),
    writeFile(path.join(outputDir, outputPromptFileName), options.prompt, "utf8"),
    writeFile(path.join(outputDir, outputMetadataFileName), JSON.stringify(metadata, null, 2), "utf8")
  ];
  if (options.draftCacheBuffer && outputDraftCacheFileName) {
    writes.push(writeFile(path.join(outputDir, outputDraftCacheFileName), options.draftCacheBuffer));
  }
  await Promise.all(writes);
  return { result: resultFromMetadata(metadata), outputFiles };
}

async function readMetadataFiles() {
  const files = (await walk(FLUX3_VIDEO_OUTPUT_ROOT)).filter((file) => file.endsWith(".json"));
  const items = await Promise.all(
    files.map(async (metadataPath) => {
      const [text, fileStat] = await Promise.all([readFile(metadataPath, "utf8"), stat(metadataPath)]);
      const metadata = JSON.parse(text) as SavedFlux3Metadata;
      if (metadata.model !== "flux-3-video" || !metadata.id || !metadata.outputFileName) return null;
      return { metadataPath, fileStat, metadata };
    })
  );
  return items
    .filter(Boolean)
    .sort((a, b) => b!.fileStat.mtimeMs - a!.fileStat.mtimeMs) as Array<{
    metadataPath: string;
    fileStat: Awaited<ReturnType<typeof stat>>;
    metadata: SavedFlux3Metadata;
  }>;
}

export async function listFlux3VideoOutputs(limit = 20) {
  const items = await readMetadataFiles();
  return items.slice(0, Math.max(0, limit)).map(({ metadata }) => resultFromMetadata(metadata));
}

export async function findFlux3VideoOutput(id: string, kind: "video" | "draft-cache" = "video") {
  const items = await readMetadataFiles();
  const item = items.find(({ metadata }) => metadata.id === id);
  if (!item) return null;
  const fileName = kind === "draft-cache" ? item.metadata.outputDraftCacheFileName : item.metadata.outputFileName;
  if (!fileName) return null;
  const filePath = path.join(path.dirname(item.metadataPath), fileName);
  return {
    filePath,
    contentType: kind === "draft-cache" ? "application/octet-stream" : videoContentType(filePath),
    fileName,
    metadata: item.metadata
  };
}
