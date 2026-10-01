import { patchOutputMetadataFile } from "@/lib/bfl-server";
import { buildGenerationTiming } from "@/lib/generation-capture";
import {
  buildVideoEditPayload,
  estimateVideoEditUsd,
  redactVideoEditPayload,
  VIDEO_EDIT_ENDPOINT,
  VIDEO_EDIT_MAX_BYTES,
  VIDEO_EDIT_MODEL,
  VIDEO_EDIT_OPERATION,
  type VideoEditRequest
} from "@/lib/video-edit";
import { saveVideoEditOutput } from "@/lib/video-edit-server";
import { downloadVideoBinary, resolveVideoInput } from "@/lib/video-input-server";
import type { OperationAdapter, OperationFinalizeInput, PreparedOperation } from "./types";

export type VideoEditRouteBody = VideoEditRequest & {
  apiKey?: string;
  wait?: boolean;
};

async function prepare(rawBody: Record<string, any>, origin = "http://localhost") {
  const body = rawBody as VideoEditRouteBody;
  try {
    const source = await resolveVideoInput(body.inputVideo || "", origin);
    if (source.buffer.byteLength > VIDEO_EDIT_MAX_BYTES) {
      return { error: "Video Edit accepts MP4 files up to 50 MB.", status: 400 };
    }
    const request: VideoEditRequest = {
      ...body,
      inputVideo: source.buffer.toString("base64"),
      sourceBytes: source.buffer.byteLength
    };
    const payload = buildVideoEditPayload(request);
    return {
      kind: "video" as const,
      operation: VIDEO_EDIT_OPERATION,
      title: body.title?.trim() || body.sourceName?.trim() || "FLUX Video Edit",
      prompt: payload.prompt,
      endpoint: VIDEO_EDIT_ENDPOINT,
      payload,
      sourceAssetIds: body.sourceAssetId ? [body.sourceAssetId] : [],
      context: {
        sourceBuffer: source.buffer,
        sourceContentType: source.contentType,
        sourceName: body.sourceName || source.sourceName,
        sourceAssetId: body.sourceAssetId || null,
        safetyTolerance: payload.safety_tolerance,
        sourceWidth: body.sourceWidth,
        sourceHeight: body.sourceHeight,
        durationSeconds: body.durationSeconds,
        estimatedUsd: estimateVideoEditUsd(body)
      }
    } satisfies PreparedOperation;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Video Edit preparation failed.", status: 400 };
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
    model: VIDEO_EDIT_MODEL,
    operation: VIDEO_EDIT_OPERATION,
    createdAt,
    endpointName: VIDEO_EDIT_ENDPOINT,
    pollingUrl: input.pollingUrl,
    sampleUrl,
    sourceAssetId: prepared.context.sourceAssetId,
    sourceName: prepared.context.sourceName,
    safetyTolerance: prepared.context.safetyTolerance,
    sourceWidth: prepared.context.sourceWidth,
    sourceHeight: prepared.context.sourceHeight,
    durationSeconds: prepared.context.durationSeconds,
    estimatedUsd: prepared.context.estimatedUsd,
    payload: redactVideoEditPayload(prepared.payload),
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
    // Duration, aspect ratio and audio are set from the source by the server.
    result: { status: result.status, outputFollowsSource: true }
  };
  const saved = await saveVideoEditOutput({
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

export const videoEditAdapter: OperationAdapter = {
  kind: "video",
  prepare,
  finalize,
  deliveryUrl(result) {
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include an edited video URL." };
  }
};
