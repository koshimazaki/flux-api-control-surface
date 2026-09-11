import { NextRequest, NextResponse } from "next/server";
import { resolveVideoInput } from "@/lib/video-input-server";
import { clampTrimSelection, trimSelectionBlocker, VIDEO_TRIM_MODEL, type VideoTrimRequest } from "@/lib/video-trim";
import { listVideoTrimOutputs, saveVideoTrimOutput, trimVideoFile } from "@/lib/video-trim-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  return NextResponse.json({ results: await listVideoTrimOutputs() });
}

/**
 * Cuts a clip down to a bracket with local ffmpeg so an over-length render can
 * be fed to Video Edit, which accepts at most 15 seconds. Local and free: no
 * BFL request, no API key, no queue, no credits.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as (VideoTrimRequest & { sourceDurationSeconds?: number }) | null;
  if (!body) return jsonError("Request body must be valid JSON.");
  if (!body.inputVideo?.trim()) return jsonError("Add a clip to cut.");

  const sourceDuration = body.sourceDurationSeconds;
  if (typeof sourceDuration !== "number" || !Number.isFinite(sourceDuration) || sourceDuration <= 0) {
    return jsonError("The clip's duration is required to place a cut.");
  }

  const selection = clampTrimSelection({ start: body.start, end: body.end }, sourceDuration);
  const blocker = trimSelectionBlocker(selection, sourceDuration);
  if (blocker) return jsonError(blocker);

  try {
    const source = await resolveVideoInput(body.inputVideo, new URL(request.url).origin);
    const duration = selection.end - selection.start;
    const videoBuffer = await trimVideoFile({
      sourceBuffer: source.buffer,
      start: selection.start,
      duration
    });
    const id = `trim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const title = body.title?.trim() || `${body.sourceName?.trim() || source.sourceName} · cut`;
    const saved = await saveVideoTrimOutput({
      id,
      title,
      videoBuffer,
      metadata: {
        id,
        title,
        model: VIDEO_TRIM_MODEL,
        createdAt: new Date().toISOString(),
        start: selection.start,
        end: selection.end,
        durationSeconds: duration,
        sourceName: body.sourceName || source.sourceName,
        sourceAssetId: body.sourceAssetId || null,
        sourceDurationSeconds: sourceDuration
      }
    });
    return NextResponse.json({ ...saved.result, outputFiles: saved.outputFiles });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not cut the clip.", 500);
  }
}
