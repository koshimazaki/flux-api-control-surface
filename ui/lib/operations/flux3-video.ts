import { readFile } from "node:fs/promises";
import { patchOutputMetadataFile, resolveImageInput } from "@/lib/bfl-server";
import {
  buildFlux3VideoPayload,
  flux3TimedKeyframes,
  redactFlux3Payload,
  type Flux3TimedKeyframe,
  type Flux3VideoRequest
} from "@/lib/flux3-video";
import { downloadFlux3Binary, findFlux3VideoOutput, saveFlux3VideoOutput } from "@/lib/flux3-video-server";
import { buildGenerationTiming } from "@/lib/generation-capture";
import type { OperationAdapter, OperationFinalizeInput, PreparedOperation } from "./types";

export type Flux3RouteBody = Flux3VideoRequest & {
  apiKey?: string;
  title?: string;
  keyframeAssetIds?: string[];
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  rowId?: string;
  /** Prompt-library record ids behind the compiled prompt, for provenance. */
  promptIds?: string[];
  /** Asset Collections the keyframes were drawn from, for provenance. */
  sourceCollectionIds?: string[];
};

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry)) : [];
}

function normalizeBinaryInput(value?: string) {
  if (!value) return value;
  const match = value.match(/^data:[^,]*;base64,([\s\S]*)$/);
  return match ? match[1] : value.trim();
}

async function prepare(rawBody: Record<string, any>, origin = "http://localhost") {
  const body = rawBody as Flux3RouteBody;
  let draftSource: Awaited<ReturnType<typeof findFlux3VideoOutput>> = null;
  const prepared: Flux3VideoRequest = { ...body };
  try {
    if (body.mode === "i2v") {
      // Timed rows resolve the image half of each `[seconds, image]` pair and
      // keep the timestamp untouched; even rows resolve the plain array.
      const timed = flux3TimedKeyframes(body);
      if (timed.length) {
        prepared.timedKeyframes = await Promise.all(
          timed.map(
            async ([seconds, value]) =>
              [seconds, normalizeBinaryInput(await resolveImageInput(value, origin)) || ""] as Flux3TimedKeyframe
          )
        );
        prepared.keyframes = undefined;
      } else {
        prepared.keyframes = await Promise.all(
          (body.keyframes || []).map(async (value) => normalizeBinaryInput(await resolveImageInput(value, origin)) || "")
        );
      }
    }
    if (body.mode === "v2v") prepared.startVideo = normalizeBinaryInput(body.startVideo);
    if (body.mode === "draft_enhance") {
      if (body.draftCacheId) {
        draftSource = await findFlux3VideoOutput(body.draftCacheId, "draft-cache");
        if (!draftSource) return { error: "The saved draft cache could not be found.", status: 404 };
        prepared.draftCache = (await readFile(draftSource.filePath)).toString("base64");
      } else {
        prepared.draftCache = normalizeBinaryInput(body.draftCache);
      }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "FLUX.3 video generation failed.", status: 500 };
  }

  let payload: Record<string, unknown>;
  try {
    payload = buildFlux3VideoPayload(prepared);
  } catch (error) {
    // The legacy route surfaced payload validation through its 500 handler; keep
    // that status so existing callers see the same failure shape.
    return { error: error instanceof Error ? error.message : "FLUX.3 video generation failed.", status: 500 };
  }

  const prompt =
    body.prompt?.trim() ||
    (typeof draftSource?.metadata.prompt === "string" ? draftSource.metadata.prompt : "[FLUX.3 draft enhancement]");
  const title =
    body.title?.trim() ||
    (body.mode === "draft_enhance" && draftSource?.metadata.title
      ? `${draftSource.metadata.title} enhanced`
      : `FLUX.3 ${body.mode}`);

  return {
    kind: "video" as const,
    operation: body.mode,
    title,
    prompt,
    endpoint: "flux-3-video",
    payload,
    sourceAssetIds: [...stringList(body.keyframeAssetIds), ...(body.draftCacheId ? [body.draftCacheId] : [])],
    context: {
      mode: body.mode,
      sourceDraftId: body.draftCacheId || null,
      keyframeAssetIds: stringList(body.keyframeAssetIds),
      // Video Script provenance: batch, row, prompts, collections, and the
      // timeline the row was planned with. Asset ids only, never media.
      keyframeSeconds: flux3TimedKeyframes(body).map(([seconds]) => seconds),
      promptIds: stringList(body.promptIds),
      sourceCollectionIds: stringList(body.sourceCollectionIds),
      batchId: body.batchId || null,
      batchIndex: typeof body.batchIndex === "number" ? body.batchIndex : null,
      batchTotal: typeof body.batchTotal === "number" ? body.batchTotal : null,
      rowId: body.rowId || null
    }
  } satisfies PreparedOperation;
}

async function finalize(input: OperationFinalizeInput) {
  const { prepared, submitted, result, marks } = input;
  const context = prepared.context;
  const sampleUrl = result.result?.sample as string;

  marks.downloadStartedAt = Date.now();
  const video = await downloadFlux3Binary(sampleUrl);
  const draftCacheUrl = result.result?.draft_cache || result.draft_cache;
  let draftCacheBuffer: Buffer | null = null;
  let draftCacheWarning: string | null = null;
  if (typeof draftCacheUrl === "string" && draftCacheUrl) {
    try {
      draftCacheBuffer = (await downloadFlux3Binary(draftCacheUrl)).buffer;
    } catch (error) {
      draftCacheWarning = error instanceof Error ? error.message : "Could not save the draft cache.";
    }
  }
  marks.downloadedAt = Date.now();

  const createdAt = new Date().toISOString();
  const id = String(submitted.id || `${Date.now()}`);
  const metadata = {
    id,
    title: prepared.title,
    prompt: prepared.prompt,
    mode: context.mode,
    model: "flux-3-video" as const,
    createdAt,
    endpointName: "flux-3-video",
    pollingUrl: input.pollingUrl,
    sampleUrl,
    sourceDraftId: context.sourceDraftId,
    keyframeAssetIds: context.keyframeAssetIds,
    keyframeSeconds: context.keyframeSeconds,
    promptIds: context.promptIds,
    sourceCollectionIds: context.sourceCollectionIds,
    batchId: context.batchId,
    batchIndex: context.batchIndex,
    batchTotal: context.batchTotal,
    rowId: context.rowId,
    payload: redactFlux3Payload(prepared.payload),
    queue: input.queue,
    timing: buildGenerationTiming(marks),
    submit: {
      cost: submitted.cost ?? null,
      creditsBefore: input.creditsBefore,
      creditsAfter: input.creditsAfter,
      creditDelta:
        typeof input.creditsBefore === "number" && typeof input.creditsAfter === "number"
          ? input.creditsBefore - input.creditsAfter
          : null
    },
    result: {
      status: result.status,
      hasDraftCache: Boolean(draftCacheBuffer)
    }
  };
  const saved = await saveFlux3VideoOutput({
    id: metadata.id,
    title: prepared.title,
    prompt: prepared.prompt,
    mode: context.mode,
    videoBuffer: video.buffer,
    videoContentType: video.contentType,
    draftCacheBuffer,
    metadata
  });
  marks.savedAt = Date.now();
  // Rewrite the sidecar the save serialized before savedAt existed.
  metadata.timing = buildGenerationTiming(marks);
  await patchOutputMetadataFile(
    (saved.outputFiles as Record<string, any>)?.metadataPath,
    { timing: metadata.timing }
  );

  return {
    response: {
      ...saved.result,
      submit: metadata.submit,
      outputFiles: saved.outputFiles,
      warning: draftCacheWarning
    },
    result: {
      mediaType: "video" as const,
      assetId: String(metadata.id),
      localPath: (saved.outputFiles as Record<string, any>)?.videoPath,
      metadataPath: (saved.outputFiles as Record<string, any>)?.metadataPath
    },
    timing: metadata.timing,
    actualCredits: submitted.cost ?? null
  };
}

export const flux3VideoAdapter: OperationAdapter = {
  kind: "video",
  prepare,
  finalize,
  deliveryUrl(result) {
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include a video URL." };
  }
};
