import type { Flux3TimedKeyframe } from "@/lib/flux3-video";
import { promptPlaceholderIssue } from "@/lib/prompt-placeholders";
import type { VideoScriptPlan, VideoScriptPlanRow } from "@/lib/video-script-plan";

/**
 * Video Script batch -> universal generation queue.
 *
 * Rows enqueue as `kind: "video"` jobs through `POST /api/dashboard/queue` with
 * `wait: false`: the server owns execution, so a closed tab never orphans paid
 * work. Payloads carry asset ids and a resolvable output URL, never base64 or
 * an API key, and every job repeats its batch/row/prompt/collection provenance
 * so the saved video can be traced back to this plan.
 */

export const VIDEO_SCRIPT_QUEUE_ROUTE = "/api/dashboard/queue";

/** Durable, server-resolvable reference for one asset id. */
export function videoScriptKeyframeSource(assetId: string, lookup?: (assetId: string) => string | undefined) {
  const resolved = lookup?.(assetId);
  return resolved || `/api/outputs/${encodeURIComponent(assetId)}/image`;
}

export type VideoScriptEnqueueContext = {
  batchId: string;
  /** Asset Collections the source pools came from. */
  sourceCollectionIds?: string[];
  /** Optional asset-id -> media URL override; defaults to the outputs route. */
  resolveAssetSource?: (assetId: string) => string | undefined;
  /** Batch label used to title each job. */
  batchLabel?: string;
};

export type VideoScriptQueueJob = {
  kind: "video";
  operation: string;
  title: string;
  payload: Record<string, unknown>;
  batchId: string;
  batchIndex: number;
  batchTotal: number;
  estimatedUsd?: number;
  sourceAssetIds: string[];
};

function jobTitle(context: VideoScriptEnqueueContext, index: number, total: number) {
  return `${context.batchLabel || "Video Script"} ${index + 1}/${total}`;
}

function payloadFor(row: VideoScriptPlanRow, context: VideoScriptEnqueueContext, index: number, total: number) {
  const source = (assetId: string) => videoScriptKeyframeSource(assetId, context.resolveAssetSource);
  const timed: Flux3TimedKeyframe[] | undefined = row.timedKeyframes?.map(
    ([seconds, assetId]) => [seconds, source(assetId)] as Flux3TimedKeyframe
  );

  return {
    mode: row.mode,
    prompt: row.compiledPrompt,
    // Even rows send a plain image array; timed rows send `[seconds, image]`
    // pairs on the additive field the FLUX.3 payload builder understands.
    ...(timed?.length ? { timedKeyframes: timed } : { keyframes: row.assetIds.map(source) }),
    aspectRatio: row.settings.aspectRatio,
    duration: row.settings.duration,
    resolution: row.settings.resolution,
    generateAudio: row.settings.generateAudio,
    safetyTolerance: row.settings.safetyTolerance,
    draft: row.settings.draft,
    title: jobTitle(context, index, total),
    keyframeAssetIds: row.assetIds,
    promptIds: row.promptIds,
    sourceCollectionIds: context.sourceCollectionIds || [],
    batchId: context.batchId,
    batchIndex: index,
    batchTotal: total,
    rowId: row.id
  } satisfies Record<string, unknown>;
}

/**
 * Queue jobs for every enqueueable row. Rows with validation errors are held
 * back rather than submitted: the plan preview lists them so they can be fixed
 * before any paid call.
 */
export function buildVideoScriptQueueJobs(
  plan: VideoScriptPlan,
  context: VideoScriptEnqueueContext
): VideoScriptQueueJob[] {
  const rows = plan.rows.filter((row) => !row.errors.length);
  // Second lock on the same door as the planner's `prompt_placeholders` error:
  // an unfilled template blank must never be submitted to a paid endpoint, so
  // the enqueue boundary refuses the batch outright instead of skipping a row.
  const blocked = rows.find((row) => promptPlaceholderIssue(row.compiledPrompt));
  if (blocked) {
    throw new Error(
      `Row ${blocked.id} still has an unfilled prompt blank. ${promptPlaceholderIssue(blocked.compiledPrompt)}`
    );
  }
  return rows.map((row, index) => ({
    kind: "video" as const,
    operation: row.mode,
    title: jobTitle(context, index, rows.length),
    payload: payloadFor(row, context, index, rows.length),
    batchId: context.batchId,
    batchIndex: index,
    batchTotal: rows.length,
    ...(typeof row.estimatedUsd === "number" ? { estimatedUsd: row.estimatedUsd } : {}),
    sourceAssetIds: row.assetIds
  }));
}

export type VideoScriptEnqueueResult = {
  jobs: VideoScriptQueueJob[];
  /** Job records the queue returned, or an empty list when nothing was sent. */
  queued: Array<Record<string, unknown>>;
};

/**
 * Posts the batch to the server-owned queue. `wait: false` is explicit: the
 * route enqueues and returns immediately, and the runner keeps the jobs moving
 * with no dashboard tab open.
 */
export async function enqueueVideoScriptPlan(
  plan: VideoScriptPlan,
  context: VideoScriptEnqueueContext,
  fetchImpl: typeof fetch = fetch
): Promise<VideoScriptEnqueueResult> {
  const jobs = buildVideoScriptQueueJobs(plan, context);
  if (!jobs.length) return { jobs, queued: [] };

  const response = await fetchImpl(VIDEO_SCRIPT_QUEUE_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobs, wait: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || "The generation queue rejected this batch.");
  return { jobs, queued: Array.isArray((data as { jobs?: unknown[] }).jobs) ? (data as { jobs: Array<Record<string, unknown>> }).jobs : [] };
}
