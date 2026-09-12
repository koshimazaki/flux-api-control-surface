import { readFile } from "node:fs/promises";
import path from "node:path";
import { assetRecipe, RECIPE_FIELDS, type GenerationRecipe } from "./generation-recipe";
import { findFlux3VideoOutput } from "./flux3-video-server";
import { findVideoEditOutput } from "./video-edit-server";
import { findVideoUpscaleOutput } from "./video-upscale-server";
import { findLocalOutputImage } from "./server-output-store";
import { readQueueState } from "./queue/store";

/** Legacy metadata is redacted; recover original local input URLs from the
 * retained descriptor when possible, without exposing the rest of the job. */
export async function readLegacyGenerationRecipe(id: string): Promise<GenerationRecipe | null> {
  const queue = await readQueueState();
  const job = queue.jobs.find(item => item.resultAssetId === id || item.result?.assetId === id || item.providerRequestId === id);
  const descriptor = job && queue.descriptors[job.id];
  if (descriptor) return { version: 1, kind: descriptor.kind, operation: descriptor.operation,
    body: Object.fromEntries(RECIPE_FIELDS.filter(key => descriptor.body[key] !== undefined).map(key => [key, descriptor.body[key]])) };
  const video = await findFlux3VideoOutput(id);
  if (video) {
    const m = video.metadata as typeof video.metadata & { keyframeAssetIds?: string[]; keyframeSeconds?: number[]; sourceDraftId?: string };
    const p = m.payload;
    const sources = (m.keyframeAssetIds || []).map(key => `/api/outputs/${encodeURIComponent(key)}/image`);
    return { version: 1, kind: "video", operation: m.mode, body: {
      mode: m.mode, prompt: m.prompt, draftCacheId: m.sourceDraftId, duration: p.duration,
      resolution: p.resolution, aspectRatio: p.aspect_ratio, generateAudio: p.generate_audio,
      safetyTolerance: p.safety_tolerance, draft: p.draft, keyframes: sources,
      keyframeAssetIds: m.keyframeAssetIds,
      timedKeyframes: m.keyframeSeconds?.length === sources.length && sources.length
        ? sources.map((source, index) => [m.keyframeSeconds![index], source]) : undefined
    } };
  }
  for (const [operation, lookup] of [["video-edit", findVideoEditOutput], ["video-upscale", findVideoUpscaleOutput]] as const) {
    const output = await lookup(id);
    if (output) {
      const m = output.metadata, p = (m as typeof m & { payload?: Record<string, unknown> }).payload || {};
      return { version: 1, kind: "video", operation, body: {
        inputVideo: `/api/bfl/${operation}/${encodeURIComponent(id)}?kind=source`, prompt: m.prompt,
        sourceAssetId: m.sourceAssetId, safetyTolerance: p.safety_tolerance,
        upscaleFactor: p.upscale_factor, creativity: p.creativity
      } };
    }
  }
  const image = await findLocalOutputImage(id);
  if (!image) return null;
  const metadataPath = image.imagePath.slice(0, -path.extname(image.imagePath).length) + ".json";
  const m = JSON.parse(await readFile(metadataPath, "utf8"));
  const base = assetRecipe({ id, model: m.model, prompt: m.payload?.prompt || m.prompt || "", payload: m.payload || {},
    runSettings: m.runSettings, operation: m.tool || m.operation, sourceAssetId: m.sourceAssetId,
    references: [], createdAt: "", timestamp: 0, status: "complete", imageDataUrl: "", imageUrl: "", image_url: "", sampleUrl: "" });
  base.body.referenceMeta = m.references;
  base.body.references = (m.references || []).map((ref: { assetId?: string }) => ref.assetId ? `/api/outputs/${encodeURIComponent(ref.assetId)}/image` : "");
  return base;
}
