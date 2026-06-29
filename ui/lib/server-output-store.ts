import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { REDACTED_IMAGE_PLACEHOLDER } from "./bfl-server";
import { toWorkspaceRelativePath } from "./local-paths";
import { estimateTokens } from "./pricing";
import { referencesFromStoredMeta } from "./reference-roles";
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
  costCredits?: number | null;
  createdAt?: string | null;
  remoteImageKey?: string | null;
  remotePromptKey?: string | null;
  remoteMetadataKey?: string | null;
};

type OutputAssetReadOptions = {
  limit?: number;
  offset?: number;
  includeImageData?: boolean;
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

function outputIdFor(metadata: Record<string, unknown>, base: string) {
  return typeof metadata.id === "string" && metadata.id ? metadata.id : path.basename(base);
}

function localOutputImageUrl(id: string) {
  return `/api/outputs/${encodeURIComponent(id)}/image`;
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
        model: metadata.model || metadata.runSettings?.model,
        promptTokens: estimateTokens(metadata.payload?.prompt || metadata.prompt || ""),
        imagePath: imagePath ? toWorkspaceRelativePath(imagePath) : undefined,
        promptPath: toWorkspaceRelativePath(`${base}.prompt.txt`),
        metadataPath: toWorkspaceRelativePath(metadataPath),
        costCredits: metadata.submit?.cost ?? metadata.submit?.creditDelta ?? null,
        createdAt: fileStat?.birthtime.toISOString() || null
      };
    })
  );
}

export async function readLocalOutputAssets(options: OutputAssetReadOptions = {}): Promise<AssetRecord[]> {
  const files = (await Promise.all(OUTPUT_ROOTS.map((root) => walk(root)))).flat();
  const metadataFiles = files.filter((file) => file.endsWith(".json")).sort().reverse();
  const offset = Math.max(0, options.offset || 0);
  const includeImageData = Boolean(options.includeImageData);
  const selectedMetadataFiles =
    typeof options.limit === "number"
      ? metadataFiles.slice(offset, offset + Math.max(0, options.limit))
      : metadataFiles.slice(offset);

  const assets = await Promise.all(
    selectedMetadataFiles.map(async (metadataPath) => {
      const base = metadataPath.replace(/\.json$/, "");
      const imagePath = imageForBase(files, base);
      if (!imagePath) return null;

      const [metadataText, fileStat] = await Promise.all([
        readFile(metadataPath, "utf8"),
        stat(imagePath)
      ]);
      const metadata = JSON.parse(metadataText);
      const id = outputIdFor(metadata, base);
      const promptPath = `${base}.prompt.txt`;
      const payloadPrompt = typeof metadata.payload?.prompt === "string" ? metadata.payload.prompt : "";
      // Older outputs stored a redacted prompt in metadata; the .prompt.txt sidecar
      // always holds the real prompt, so prefer it whenever the payload is empty or redacted.
      const prompt =
        payloadPrompt && payloadPrompt !== REDACTED_IMAGE_PLACEHOLDER
          ? payloadPrompt
          : (await readFile(promptPath, "utf8").catch(() => "")) || payloadPrompt;
      const imageDataUrl = includeImageData
        ? `data:${imageMime(imagePath)};base64,${(await readFile(imagePath)).toString("base64")}`
        : "";
      const imageUrl = imageDataUrl || localOutputImageUrl(id);

      return {
        id,
        title: titleFromPath(metadataPath),
        createdAt: fileStat.birthtime.toISOString(),
        timestamp: fileStat.birthtimeMs,
        imageDataUrl,
        imageUrl,
        image_url: imageUrl,
        sampleUrl: imageUrl,
        model: metadata.model || metadata.runSettings?.model || "bfl-api",
        prompt,
        status: "complete",
        width: metadata.payload?.width,
        height: metadata.payload?.height,
        seed: metadata.payload?.seed,
        aspectRatio:
          metadata.payload?.width && metadata.payload?.height
            ? `${metadata.payload.width}:${metadata.payload.height}`
            : undefined,
        provider: metadata.provider || metadata.runSettings?.provider || "bfl-api",
        payload: metadata.payload || {},
        references: referencesFromStoredMeta(metadata.references),
        runSettings: metadata.runSettings || {
          title: path.basename(base),
          provider: metadata.provider || metadata.runSettings?.provider || "bfl-api",
          model: metadata.model || metadata.runSettings?.model || "bfl-api",
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
        localImagePath: toWorkspaceRelativePath(imagePath),
        localPromptPath: toWorkspaceRelativePath(promptPath),
        localMetadataPath: toWorkspaceRelativePath(metadataPath),
        localSvgPath: metadata.outputSvgPath ?? null,
        sourceAssetId: metadata.sourceAssetId ?? metadata.runSettings?.sourceAssetId ?? null,
        operation: metadata.operation ?? metadata.runSettings?.operation ?? null,
        assetKind: metadata.assetKind ?? undefined
      } satisfies AssetRecord;
    })
  );

  return assets.filter(Boolean) as AssetRecord[];
}

export async function findLocalOutputImage(id: string) {
  const files = (await Promise.all(OUTPUT_ROOTS.map((root) => walk(root)))).flat();
  const metadataFiles = files.filter((file) => file.endsWith(".json")).sort().reverse();

  for (const metadataPath of metadataFiles) {
    const base = metadataPath.replace(/\.json$/, "");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8").catch(() => "{}"));
    if (outputIdFor(metadata, base) !== id && path.basename(base) !== id) continue;
    const imagePath = imageForBase(files, base);
    if (!imagePath) return null;
    return {
      imagePath,
      contentType: imageMime(imagePath)
    };
  }

  return null;
}
