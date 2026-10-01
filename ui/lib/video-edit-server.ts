import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "@/lib/bfl-server";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import { VIDEO_EDIT_MODEL, type VideoEditResult } from "@/lib/video-edit";

export const VIDEO_EDIT_OUTPUT_ROOT = path.resolve(
  process.cwd(),
  "..",
  "outputs",
  "flux-api-control-surface",
  "video-edit"
);

type SavedVideoEditMetadata = {
  id: string;
  title: string;
  prompt: string;
  model: typeof VIDEO_EDIT_MODEL;
  createdAt: string;
  safetyTolerance: number;
  sourceWidth?: number;
  sourceHeight?: number;
  durationSeconds?: number;
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

function resultFromMetadata(metadata: SavedVideoEditMetadata): VideoEditResult {
  return {
    id: metadata.id,
    title: metadata.title,
    prompt: metadata.prompt,
    createdAt: metadata.createdAt,
    sourceVideoUrl: `/api/bfl/video-edit/${encodeURIComponent(metadata.id)}?kind=source`,
    videoUrl: `/api/bfl/video-edit/${encodeURIComponent(metadata.id)}`,
    safetyTolerance: metadata.safetyTolerance,
    sourceWidth: metadata.sourceWidth,
    sourceHeight: metadata.sourceHeight,
    durationSeconds: metadata.durationSeconds,
    estimatedUsd: metadata.estimatedUsd,
    costCredits: metadata.submit?.cost ?? null,
    creditsAfter: metadata.submit?.creditsAfter ?? null,
    sourceAssetId: typeof metadata.sourceAssetId === "string" ? metadata.sourceAssetId : null,
    outputFiles: metadata.outputFiles
  };
}

/** Saves the source beside the edited clip so the before/after fader survives a reload. */
export async function saveVideoEditOutput(options: {
  id: string;
  title: string;
  prompt: string;
  sourceBuffer: Buffer;
  sourceContentType: string;
  videoBuffer: Buffer;
  videoContentType: string;
  metadata: Omit<SavedVideoEditMetadata, "outputSourceFileName" | "outputFileName" | "outputFiles"> & Record<string, unknown>;
}) {
  const createdAt = options.metadata.createdAt || new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const stamp = createdAt.replace(/[:.]/g, "-");
  const safeTitle = slugify(options.title) || "video-edit";
  const safeId = slugify(options.id) || `${Date.now()}`;
  const baseName = `${stamp}_${safeTitle}_${safeId}`;
  const outputDir = path.join(VIDEO_EDIT_OUTPUT_ROOT, date);
  const sourceFileName = `${baseName}.source.${videoExtension(options.sourceContentType)}`;
  const outputFileName = `${baseName}.edited.${videoExtension(options.videoContentType)}`;
  const promptFileName = `${baseName}.prompt.txt`;
  const metadataFileName = `${baseName}.json`;
  await mkdir(outputDir, { recursive: true });
  const outputFiles = {
    sourceVideoPath: toWorkspaceRelativePath(path.join(outputDir, sourceFileName)),
    videoPath: toWorkspaceRelativePath(path.join(outputDir, outputFileName)),
    promptPath: toWorkspaceRelativePath(path.join(outputDir, promptFileName)),
    metadataPath: toWorkspaceRelativePath(path.join(outputDir, metadataFileName))
  };
  const metadata: SavedVideoEditMetadata = {
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
  const files = (await walk(VIDEO_EDIT_OUTPUT_ROOT)).filter((file) => file.endsWith(".json"));
  const items = await Promise.all(files.map(async (metadataPath) => {
    const [text, fileStat] = await Promise.all([readFile(metadataPath, "utf8"), stat(metadataPath)]);
    const metadata = JSON.parse(text) as SavedVideoEditMetadata;
    if (metadata.model !== VIDEO_EDIT_MODEL || !metadata.id || !metadata.outputFileName) return null;
    return { metadataPath, fileStat, metadata };
  }));
  return items.filter(Boolean).sort((a, b) => b!.fileStat.mtimeMs - a!.fileStat.mtimeMs) as Array<{
    metadataPath: string;
    fileStat: Awaited<ReturnType<typeof stat>>;
    metadata: SavedVideoEditMetadata;
  }>;
}

export async function listVideoEditOutputs(limit = 20) {
  return (await readMetadataFiles()).slice(0, Math.max(0, limit)).map(({ metadata }) => resultFromMetadata(metadata));
}

export async function findVideoEditOutput(id: string, kind: "video" | "source" = "video") {
  const item = (await readMetadataFiles()).find(({ metadata }) => metadata.id === id);
  if (!item) return null;
  const fileName = kind === "source" ? item.metadata.outputSourceFileName : item.metadata.outputFileName;
  const filePath = path.join(path.dirname(item.metadataPath), fileName);
  return { filePath, contentType: videoContentType(filePath), fileName, metadata: item.metadata };
}
