import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { slugify } from "@/lib/bfl-server";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import { buildTrimArgs, VIDEO_TRIM_MODEL, type VideoTrimResult } from "@/lib/video-trim";
import { percentFromProgressChunk } from "@/lib/video-trim-progress";

export const VIDEO_TRIM_OUTPUT_ROOT = path.resolve(
  process.cwd(),
  "..",
  "outputs",
  "flux-api-control-surface",
  "video-trim"
);

type SavedVideoTrimMetadata = {
  id: string;
  title: string;
  model: typeof VIDEO_TRIM_MODEL;
  createdAt: string;
  start: number;
  end: number;
  durationSeconds: number;
  sourceName?: string;
  sourceAssetId?: string | null;
  sourceDurationSeconds?: number;
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

function resultFromMetadata(metadata: SavedVideoTrimMetadata): VideoTrimResult {
  return {
    id: metadata.id,
    title: metadata.title,
    createdAt: metadata.createdAt,
    videoUrl: `/api/bfl/video-trim/${encodeURIComponent(metadata.id)}`,
    start: metadata.start,
    end: metadata.end,
    durationSeconds: metadata.durationSeconds,
    sourceName: metadata.sourceName,
    sourceAssetId: typeof metadata.sourceAssetId === "string" ? metadata.sourceAssetId : null,
    sourceDurationSeconds: metadata.sourceDurationSeconds,
    outputFiles: metadata.outputFiles
  };
}

/**
 * Same spawn shape as the audio routes, plus ffmpeg's `-progress` stream on
 * stdout when a caller wants a percentage. stderr stays the diagnostic.
 */
export function runFfmpeg(args: string[], onProgressChunk?: (chunk: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", onProgressChunk ? "pipe" : "ignore", "pipe"] });
    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk) => onProgressChunk?.(String(chunk)));
    child.stderr?.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      const message = (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "ffmpeg is not installed or not on PATH, so clips cannot be cut locally."
        : error.message;
      reject(new Error(message));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(chunks).toString("utf8").trim() || `ffmpeg exited with ${code}`));
    });
  });
}

/**
 * Cuts the selected bracket out of a clip with ffmpeg and saves it beside the
 * other local outputs. This is a local, free operation: no BFL call, no queue,
 * no credits.
 */
export async function trimVideoFile(options: {
  sourceBuffer: Buffer;
  sourceExtension?: string;
  start: number;
  duration: number;
  onPercent?: (percent: number) => void;
}) {
  const workDir = await mkdtemp(path.join(tmpdir(), "bfl-video-trim-"));
  const inputPath = path.join(workDir, `source.${options.sourceExtension || "mp4"}`);
  const outputPath = path.join(workDir, "trimmed.mp4");
  try {
    await writeFile(inputPath, options.sourceBuffer);
    const args = buildTrimArgs({ inputPath, outputPath, start: options.start, duration: options.duration });
    await runFfmpeg(
      options.onPercent ? [...args.slice(0, -1), "-progress", "pipe:1", "-nostats", args[args.length - 1]] : args,
      options.onPercent
        ? (chunk) => {
            const percent = percentFromProgressChunk(chunk, options.duration);
            if (percent !== null) options.onPercent?.(percent);
          }
        : undefined
    );
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function saveVideoTrimOutput(options: {
  id: string;
  title: string;
  videoBuffer: Buffer;
  metadata: Omit<SavedVideoTrimMetadata, "outputFileName" | "outputFiles"> & Record<string, unknown>;
}) {
  const createdAt = options.metadata.createdAt || new Date().toISOString();
  const date = createdAt.slice(0, 10);
  const stamp = createdAt.replace(/[:.]/g, "-");
  const baseName = `${stamp}_${slugify(options.title) || "video-trim"}_${slugify(options.id) || Date.now()}`;
  const outputDir = path.join(VIDEO_TRIM_OUTPUT_ROOT, date);
  const outputFileName = `${baseName}.trimmed.mp4`;
  const metadataFileName = `${baseName}.json`;
  await mkdir(outputDir, { recursive: true });
  const outputFiles = {
    videoPath: toWorkspaceRelativePath(path.join(outputDir, outputFileName)),
    metadataPath: toWorkspaceRelativePath(path.join(outputDir, metadataFileName))
  };
  const metadata: SavedVideoTrimMetadata = { ...options.metadata, outputFileName, outputFiles };
  await Promise.all([
    writeFile(path.join(outputDir, outputFileName), options.videoBuffer),
    writeFile(path.join(outputDir, metadataFileName), JSON.stringify(metadata, null, 2), "utf8")
  ]);
  return { result: resultFromMetadata(metadata), outputFiles };
}

async function readMetadataFiles() {
  const files = (await walk(VIDEO_TRIM_OUTPUT_ROOT)).filter((file) => file.endsWith(".json"));
  const items = await Promise.all(files.map(async (metadataPath) => {
    const [text, fileStat] = await Promise.all([readFile(metadataPath, "utf8"), stat(metadataPath)]);
    const metadata = JSON.parse(text) as SavedVideoTrimMetadata;
    if (metadata.model !== VIDEO_TRIM_MODEL || !metadata.id || !metadata.outputFileName) return null;
    return { metadataPath, fileStat, metadata };
  }));
  return items.filter(Boolean).sort((a, b) => b!.fileStat.mtimeMs - a!.fileStat.mtimeMs) as Array<{
    metadataPath: string;
    fileStat: Awaited<ReturnType<typeof stat>>;
    metadata: SavedVideoTrimMetadata;
  }>;
}

export async function listVideoTrimOutputs(limit = 20) {
  return (await readMetadataFiles()).slice(0, Math.max(0, limit)).map(({ metadata }) => resultFromMetadata(metadata));
}

export async function findVideoTrimOutput(id: string) {
  const item = (await readMetadataFiles()).find(({ metadata }) => metadata.id === id);
  if (!item) return null;
  const filePath = path.join(path.dirname(item.metadataPath), item.metadata.outputFileName);
  return { filePath, contentType: "video/mp4", fileName: item.metadata.outputFileName, metadata: item.metadata };
}
