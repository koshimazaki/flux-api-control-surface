import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_EVALUATION_ANNOTATION,
  approximatePromptTokens,
  normalizeEvaluationAnnotation,
  sanitizeEvaluationSettings,
  type GenerationEvaluationAnnotation,
  type GenerationEvaluationRecord
} from "@/lib/generation-evaluation";
import type { GenerationTiming } from "@/lib/generation-capture";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import { unsuccessfulQueueEvaluations } from "@/lib/queue/evaluation";
import { OUTPUT_ROOT } from "@/lib/server-output-store";

const LEGACY_OUTPUT_ROOT = path.resolve(process.cwd(), "..", "outputs", "bfl-api-dashboard");
const OUTPUT_ROOTS = [OUTPUT_ROOT, LEGACY_OUTPUT_ROOT];
const ANNOTATION_DIR = path.join(OUTPUT_ROOT, ".evaluations");
const ANNOTATION_PATH = path.join(ANNOTATION_DIR, "annotations.json");

type MetadataCandidate = {
  metadataPath: string;
  metadata: Record<string, any>;
  fileStat: Awaited<ReturnType<typeof stat>>;
};

type EvaluationFilters = {
  id?: string;
  mediaType?: string;
  model?: string;
  verdict?: string;
  search?: string;
  limit?: number;
};

async function walk(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (
      await Promise.all(
        entries
          .filter((entry) => !entry.name.startsWith("."))
          .map((entry) => {
            const fullPath = path.join(directory, entry.name);
            return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
          })
      )
    ).flat();
  } catch {
    return [];
  }
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringList(...values: unknown[]) {
  return [...new Set(values.flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(stringValue)
    .filter((value): value is string => Boolean(value)))];
}

async function readAnnotations(): Promise<Record<string, GenerationEvaluationAnnotation>> {
  try {
    const raw = JSON.parse(await readFile(ANNOTATION_PATH, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).map(([id, annotation]) => [id, normalizeEvaluationAnnotation(annotation)])
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw error;
  }
}

async function writeAnnotations(annotations: Record<string, GenerationEvaluationAnnotation>) {
  await mkdir(ANNOTATION_DIR, { recursive: true });
  const temp = `${ANNOTATION_PATH}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(annotations, null, 2)}\n`, "utf8");
  await rename(temp, ANNOTATION_PATH);
}

let writeQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function readCandidates(): Promise<MetadataCandidate[]> {
  const files = (await Promise.all(OUTPUT_ROOTS.map(walk))).flat();
  const candidates = await Promise.all(
    files.filter((file) => file.endsWith(".json")).map(async (metadataPath) => {
      try {
        const [text, fileStat] = await Promise.all([readFile(metadataPath, "utf8"), stat(metadataPath)]);
        const metadata = JSON.parse(text);
        if (!metadata || typeof metadata !== "object" || !stringValue(metadata.id)) return null;
        if (!metadata.model && !metadata.endpointName && !metadata.runSettings?.model) return null;
        if (!metadata.pollingUrl && !metadata.submit && metadata.model !== "flux-3-video") return null;
        return { metadataPath, metadata, fileStat } satisfies MetadataCandidate;
      } catch {
        return null;
      }
    })
  );
  return candidates.flatMap((item) => item ? [item as MetadataCandidate] : []);
}

async function promptFor(candidate: MetadataCandidate) {
  const metadataPrompt = stringValue(candidate.metadata.prompt) || stringValue(candidate.metadata.payload?.prompt);
  const sidecarName = stringValue(candidate.metadata.outputPromptFileName);
  const sidecarPath = sidecarName
    ? path.join(path.dirname(candidate.metadataPath), sidecarName)
    : candidate.metadataPath.replace(/\.json$/, ".prompt.txt");
  const sidecarPrompt = await readFile(sidecarPath, "utf8").catch(() => "");
  return sidecarPrompt.trim() || metadataPrompt || "";
}

function outputPathFor(candidate: MetadataCandidate, mediaType: "image" | "video") {
  const direct = mediaType === "video"
    ? stringValue(candidate.metadata.outputFiles?.videoPath)
    : stringValue(candidate.metadata.outputFiles?.imagePath);
  if (direct) return direct;
  const outputName = stringValue(candidate.metadata.outputFileName);
  if (outputName) return toWorkspaceRelativePath(path.join(path.dirname(candidate.metadataPath), outputName));
  return undefined;
}

/**
 * The FLUX 3 adapter records a keyframe timeline as parallel `keyframeAssetIds`
 * and `keyframeSeconds` arrays, while older records used a single `keyframes`
 * array of objects. Read both so video evaluations keep their timeline.
 */
export function readKeyframes(metadata: Record<string, any>) {
  const legacy = Array.isArray(metadata.keyframes) ? metadata.keyframes : [];
  if (legacy.length) {
    return legacy.slice(0, 10).map((item: unknown) => {
      if (!item || typeof item !== "object") return {};
      const value = item as Record<string, unknown>;
      return { assetId: stringValue(value.assetId), seconds: numberValue(value.seconds) };
    });
  }
  const assetIds = Array.isArray(metadata.keyframeAssetIds) ? metadata.keyframeAssetIds : [];
  const seconds = Array.isArray(metadata.keyframeSeconds) ? metadata.keyframeSeconds : [];
  const count = Math.min(10, Math.max(assetIds.length, seconds.length));
  return Array.from({ length: count }, (_, index) => ({
    assetId: stringValue(assetIds[index]),
    seconds: numberValue(seconds[index])
  }));
}

function timingFor(value: unknown): GenerationTiming | undefined {
  if (!value || typeof value !== "object") return undefined;
  const timing = value as GenerationTiming;
  return typeof timing.requestStartedAt === "string" && typeof timing.capturedAt === "string" ? timing : undefined;
}

async function toEvaluationRecord(
  candidate: MetadataCandidate,
  annotations: Record<string, GenerationEvaluationAnnotation>
): Promise<GenerationEvaluationRecord> {
  const metadata = candidate.metadata;
  const id = String(metadata.id);
  const model = stringValue(metadata.model) || stringValue(metadata.runSettings?.model) || "bfl-api";
  const mediaType = model === "flux-3-video" || metadata.mode || metadata.outputFiles?.videoPath ? "video" : "image";
  const prompt = await promptFor(candidate);
  const createdAt = stringValue(metadata.createdAt) || stringValue(metadata.runSettings?.createdAt) || candidate.fileStat.birthtime.toISOString();
  const submittedCredits = numberValue(metadata.submit?.cost);
  const chargedCredits = numberValue(metadata.submit?.creditDelta);
  const sourceAssetIds = stringList(
    metadata.sourceAssetId,
    metadata.runSettings?.sourceAssetId,
    metadata.garmentAssetIds,
    metadata.sourceAssetIds,
    metadata.keyframeAssetIds
  );
  const collectionIds = stringList(metadata.collectionIds, metadata.sourceCollectionIds);
  const promptSourceIds = stringList(metadata.promptIds, metadata.promptId);
  const keyframes = readKeyframes(metadata);
  const localPath = outputPathFor(candidate, mediaType);
  return {
    schemaVersion: "bfl-evaluation/v1",
    id,
    title: stringValue(metadata.title) || stringValue(metadata.runSettings?.title) || path.basename(candidate.metadataPath, ".json"),
    createdAt,
    mediaType,
    provider: stringValue(metadata.provider) || stringValue(metadata.runSettings?.provider) || "bfl-api",
    model,
    endpoint: stringValue(metadata.endpointName) || stringValue(metadata.runSettings?.endpointName) || model,
    operation: stringValue(metadata.operation) || stringValue(metadata.tool) || stringValue(metadata.mode) || "generate",
    mode: stringValue(metadata.mode),
    status: "complete",
    prompt: { text: prompt, approximateTokens: approximatePromptTokens(prompt), sourceIds: promptSourceIds },
    settings: (sanitizeEvaluationSettings(metadata.payload || {}) || {}) as Record<string, unknown>,
    timing: timingFor(metadata.timing),
    queue: metadata.queue && typeof metadata.queue === "object" ? metadata.queue : undefined,
    cost: {
      submittedCredits,
      chargedCredits,
      creditsBefore: numberValue(metadata.submit?.creditsBefore),
      creditsAfter: numberValue(metadata.submit?.creditsAfter)
    },
    providerRequest: { id, pollingUrl: stringValue(metadata.pollingUrl) },
    sources: { assetIds: sourceAssetIds, collectionIds, keyframes },
    provenance: {
      batchId: stringValue(metadata.batchId),
      rowId: stringValue(metadata.rowId),
      // Video rows record their position as batchIndex; older records used rowIndex.
      rowIndex: numberValue(metadata.rowIndex) ?? numberValue(metadata.batchIndex)
    },
    output: {
      previewUrl: mediaType === "video"
        ? model === "flux-tools-video-upscale-v1"
          ? `/api/bfl/video-upscale/${encodeURIComponent(id)}`
          : `/api/bfl/flux3-video/${encodeURIComponent(id)}`
        : `/api/outputs/${encodeURIComponent(id)}/image`,
      localPath,
      metadataPath: toWorkspaceRelativePath(candidate.metadataPath)
    },
    annotation: annotations[id] || { ...DEFAULT_EVALUATION_ANNOTATION }
  };
}

export async function listGenerationEvaluations(filters: EvaluationFilters = {}) {
  const [candidates, annotations] = await Promise.all([readCandidates(), readAnnotations()]);
  const saved = await Promise.all(candidates.map((candidate) => toEvaluationRecord(candidate, annotations)));
  // Failed and cancelled queue attempts join the same read model so retries and
  // recoveries are visible next to the generations that succeeded.
  const unsuccessful = await unsuccessfulQueueEvaluations(annotations);
  const savedIds = new Set(saved.map((record) => record.id));
  const records = [...saved, ...unsuccessful.filter((record) => !savedIds.has(record.id))];
  const search = filters.search?.trim().toLowerCase();
  return records
    .filter((record) => !filters.id || record.id === filters.id)
    .filter((record) => !filters.mediaType || record.mediaType === filters.mediaType)
    .filter((record) => !filters.model || record.model === filters.model)
    .filter((record) => !filters.verdict || record.annotation.verdict === filters.verdict)
    .filter((record) => !search || `${record.title} ${record.prompt.text} ${record.model} ${record.annotation.tags.join(" ")}`.toLowerCase().includes(search))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, Math.max(0, Math.min(filters.limit ?? 200, 1000)));
}

export async function updateGenerationEvaluation(id: string, value: unknown) {
  return serialize(async () => {
    const records = await listGenerationEvaluations({ id, limit: 1 });
    if (!records.length) return null;
    const annotations = await readAnnotations();
    const annotation = normalizeEvaluationAnnotation({
      ...(annotations[id] || {}),
      ...(value && typeof value === "object" ? value : {}),
      updatedAt: new Date().toISOString()
    });
    annotations[id] = annotation;
    await writeAnnotations(annotations);
    return { ...records[0], annotation };
  });
}

export function evaluationAnnotationPath() {
  return toWorkspaceRelativePath(ANNOTATION_PATH);
}
