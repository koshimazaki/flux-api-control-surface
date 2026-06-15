import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { estimateTokens } from "./pricing";
import type { AssetRecord } from "./types";

export const OUTPUT_ROOT = path.resolve(process.cwd(), "..", "outputs", "flux-api-control-surface");
const LEGACY_OUTPUT_ROOT = path.resolve(process.cwd(), "..", "outputs", "bfl-api-dashboard");
const OUTPUT_ROOTS = [OUTPUT_ROOT, LEGACY_OUTPUT_ROOT];

export type OutputManifestItem = {
  id: string;
  title: string;
  model?: string;
  promptTokens: number;
  imagePath?: string;
  promptPath?: string;
  metadataPath?: string;
  sampleUrl?: string;
  costCredits?: number | null;
  creditsBefore?: number | null;
  creditsAfter?: number | null;
  createdAt?: string | null;
  remoteImageKey?: string | null;
  remotePromptKey?: string | null;
  remoteMetadataKey?: string | null;
};

async function walk(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const children = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
      })
    );
    return children.flat();
  } catch {
    return [];
  }
}

function imageMime(filePath: string) {
  if (filePath.endsWith(".webp")) return "image/webp";
  return filePath.endsWith(".png") ? "image/png" : "image/jpeg";
}

function titleFromPath(filePath: string) {
  const base = path.basename(filePath).replace(/\.(json|prompt\.txt|jpe?g|png|webp)$/i, "");
  return base.replace(/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}t\d{2}-\d{2}-\d{2}-\d{3}z_/i, "");
}

function imageForBase(files: string[], base: string) {
  return (
    files.find(
      (file) =>
        file === `${base}.jpg` ||
        file === `${base}.jpeg` ||
        file === `${base}.png` ||
        file === `${base}.webp`
    ) || ""
  );
}

export async function readLocalOutputManifest(): Promise<OutputManifestItem[]> {
  const files = (await Promise.all(OUTPUT_ROOTS.map((root) => walk(root)))).flat();
  const metadataFiles = files.filter((file) => file.endsWith(".json")).sort().reverse();

  return Promise.all(
    metadataFiles.map(async (metadataPath) => {
      const base = metadataPath.replace(/\.json$/, "");
      const imagePath = imageForBase(files, base);
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      const fileStat = imagePath ? await stat(imagePath).catch(() => null) : null;

      return {
        id: metadata.id || path.basename(base),
        title: path.basename(base),
        model: metadata.model,
        promptTokens: estimateTokens(metadata.payload?.prompt || ""),
        imagePath,
        promptPath: `${base}.prompt.txt`,
        metadataPath,
        sampleUrl: metadata.sampleUrl,
        costCredits: metadata.submit?.cost ?? metadata.submit?.creditDelta ?? null,
        creditsBefore: metadata.submit?.creditsBefore ?? null,
        creditsAfter: metadata.submit?.creditsAfter ?? null,
        createdAt: fileStat?.birthtime.toISOString() || null
      };
    })
  );
}

export async function readLocalOutputAssets(): Promise<AssetRecord[]> {
  const files = (await Promise.all(OUTPUT_ROOTS.map((root) => walk(root)))).flat();
  const metadataFiles = files.filter((file) => file.endsWith(".json")).sort().reverse();

  const assets = await Promise.all(
    metadataFiles.map(async (metadataPath) => {
      const base = metadataPath.replace(/\.json$/, "");
      const imagePath = imageForBase(files, base);
      if (!imagePath) return null;

      const [metadataText, imageBuffer, fileStat] = await Promise.all([
        readFile(metadataPath, "utf8"),
        readFile(imagePath),
        stat(imagePath)
      ]);
      const metadata = JSON.parse(metadataText);
      const promptPath = `${base}.prompt.txt`;
      const prompt = metadata.payload?.prompt || (await readFile(promptPath, "utf8").catch(() => ""));
      const imageDataUrl = `data:${imageMime(imagePath)};base64,${imageBuffer.toString("base64")}`;

      return {
        id: metadata.id || path.basename(base),
        title: titleFromPath(metadataPath),
        createdAt: fileStat.birthtime.toISOString(),
        timestamp: fileStat.birthtimeMs,
        imageDataUrl,
        imageUrl: metadata.sampleUrl || imageDataUrl,
        image_url: metadata.sampleUrl || imageDataUrl,
        sampleUrl: metadata.sampleUrl || imageDataUrl,
        model: metadata.model || "bfl-api",
        prompt,
        status: "complete",
        width: metadata.payload?.width,
        height: metadata.payload?.height,
        seed: metadata.payload?.seed,
        aspectRatio:
          metadata.payload?.width && metadata.payload?.height
            ? `${metadata.payload.width}:${metadata.payload.height}`
            : undefined,
        provider: "bfl-api",
        payload: metadata.payload || {},
        references: [],
        runSettings: metadata.runSettings || {
          title: path.basename(base),
          provider: "bfl-api",
          model: metadata.model || "bfl-api",
          endpointName: metadata.endpointName,
          width: metadata.payload?.width,
          height: metadata.payload?.height,
          outputFormat: metadata.payload?.output_format,
          seed: metadata.payload?.seed ?? null,
          promptUpsampling: Boolean(metadata.payload?.prompt_upsampling),
          safetyTolerance: metadata.payload?.safety_tolerance ?? null,
          referenceCount: Object.keys(metadata.payload || {}).filter((key) => key.startsWith("input_image")).length,
          requestId: metadata.id || null,
          submittedCost: metadata.submit?.cost ?? null,
          inputMp: metadata.submit?.inputMp ?? null,
          outputMp: metadata.submit?.outputMp ?? null,
          createdAt: fileStat.birthtime.toISOString()
        },
        costCredits: metadata.submit?.cost ?? metadata.submit?.creditDelta ?? null,
        inputMp: metadata.submit?.inputMp ?? null,
        outputMp: metadata.submit?.outputMp ?? null,
        creditsBefore: metadata.submit?.creditsBefore ?? null,
        creditsAfter: metadata.submit?.creditsAfter ?? null,
        creditDelta: metadata.submit?.creditDelta ?? null,
        localImagePath: imagePath,
        localPromptPath: promptPath,
        localMetadataPath: metadataPath
      } satisfies AssetRecord;
    })
  );

  return assets.filter(Boolean) as AssetRecord[];
}
