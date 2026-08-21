import { patchOutputMetadataFile } from "@/lib/bfl-server";
import { buildGenerationTiming } from "@/lib/generation-capture";
import {
  buildVideoUpscalePayload,
  estimateVideoUpscaleUsd,
  redactVideoUpscalePayload,
  VIDEO_UPSCALE_ENDPOINT,
  VIDEO_UPSCALE_MODEL,
  VIDEO_UPSCALE_OPERATION,
  VIDEO_UPSCALE_MAX_BYTES,
  type VideoUpscaleRequest
} from "@/lib/video-upscale";
import { downloadVideoBinary, resolveVideoInput, saveVideoUpscaleOutput } from "@/lib/video-upscale-server";
import type { OperationAdapter, OperationFinalizeInput, PreparedOperation } from "./types";

export type VideoUpscaleRouteBody = VideoUpscaleRequest & {
  apiKey?: string;
  wait?: boolean;
};

async function prepare(rawBody: Record<string, any>, origin = "http://localhost") {
  const body = rawBody as VideoUpscaleRouteBody;
  try {
    const source = await resolveVideoInput(body.inputVideo || "", origin);
    if (source.buffer.byteLength > VIDEO_UPSCALE_MAX_BYTES) {
      return { error: "Video Upscale accepts MP4 files up to 50 MB.", status: 400 };
    }
    const request: VideoUpscaleRequest = {
      ...body,
      inputVideo: source.buffer.toString("base64"),
      sourceBytes: source.buffer.byteLength
    };
    const payload = buildVideoUpscalePayload(request);
    const prompt = body.prompt?.trim() || "[FLUX 3 video upscale]";
    return {
      kind: "video" as const,
      operation: VIDEO_UPSCALE_OPERATION,
      title: body.title?.trim() || body.sourceName?.trim() || "FLUX 3 Video Upscale",
      prompt,
      endpoint: VIDEO_UPSCALE_ENDPOINT,
      payload,
      sourceAssetIds: body.sourceAssetId ? [body.sourceAssetId] : [],
      context: {
        sourceBuffer: source.buffer,
        sourceContentType: source.contentType,
        sourceName: body.sourceName || source.sourceName,
        sourceAssetId: body.sourceAssetId || null,
        upscaleFactor: body.upscaleFactor ?? 2,
        creativity: body.creativity ?? 1,
        safetyTolerance: body.safetyTolerance ?? 2,
        sourceWidth: body.sourceWidth,
        sourceHeight: body.sourceHeight,
        durationSeconds: body.durationSeconds,
        outputWidth: body.sourceWidth ? Math.round(body.sourceWidth * (body.upscaleFactor ?? 2)) : undefined,
        outputHeight: body.sourceHeight ? Math.round(body.sourceHeight * (body.upscaleFactor ?? 2)) : undefined,
        estimatedUsd: estimateVideoUpscaleUsd(body)
      }
    } satisfies PreparedOperation;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Video Upscale preparation failed.", status: 400 };
  }
}

async function finalize(input: OperationFinalizeInput) {
  const { prepared, submitted, result, marks } = input;
  const sampleUrl = result.result?.sample as string;
  marks.downloadStartedAt = Date.now();
  const video = await downloadVideoBinary(sampleUrl);
  marks.downloadedAt = Date.now();
  const id = String(submitted.id || `${Date.now()}`);
  const createdAt = new Date().toISOString();
  const metadata = {
    id,
    title: prepared.title,
    prompt: prepared.prompt,
    model: VIDEO_UPSCALE_MODEL,
    operation: VIDEO_UPSCALE_OPERATION,
    createdAt,
    endpointName: VIDEO_UPSCALE_ENDPOINT,
    pollingUrl: input.pollingUrl,
    sampleUrl,
    sourceAssetId: prepared.context.sourceAssetId,
    sourceName: prepared.context.sourceName,
    upscaleFactor: prepared.context.upscaleFactor,
    creativity: prepared.context.creativity,
    safetyTolerance: prepared.context.safetyTolerance,
    sourceWidth: prepared.context.sourceWidth,
    sourceHeight: prepared.context.sourceHeight,
    durationSeconds: prepared.context.durationSeconds,
    outputWidth: prepared.context.outputWidth,
    outputHeight: prepared.context.outputHeight,
    estimatedUsd: prepared.context.estimatedUsd,
    payload: redactVideoUpscalePayload(prepared.payload),
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
    result: { status: result.status, audioPreserved: true }
  };
  const saved = await saveVideoUpscaleOutput({
    id,
    title: prepared.title,
    prompt: prepared.prompt,
    sourceBuffer: prepared.context.sourceBuffer,
    sourceContentType: prepared.context.sourceContentType,
    videoBuffer: video.buffer,
    videoContentType: video.contentType,
    metadata
  });
  marks.savedAt = Date.now();
  metadata.timing = buildGenerationTiming(marks);
  await patchOutputMetadataFile(
    (saved.outputFiles as Record<string, any>)?.metadataPath,
    { timing: metadata.timing }
  );
  return {
    response: { ...saved.result, submit: metadata.submit, outputFiles: saved.outputFiles },
    result: {
      mediaType: "video" as const,
      assetId: id,
      localPath: (saved.outputFiles as Record<string, any>)?.videoPath,
      metadataPath: (saved.outputFiles as Record<string, any>)?.metadataPath
    },
    timing: metadata.timing,
    actualCredits: submitted.cost ?? null
  };
}

export const videoUpscaleAdapter: OperationAdapter = {
  kind: "video",
  prepare,
  finalize,
  deliveryUrl(result) {
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include an upscaled video URL." };
  }
};
