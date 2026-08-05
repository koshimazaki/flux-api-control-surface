import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/bfl-server";
import { listFlux3VideoOutputs } from "@/lib/flux3-video-server";
import { VIDEO_ROUTE_WAIT_MS, queueBackedResponse, wantsWait } from "@/lib/queue/http";
import type { Flux3RouteBody } from "@/lib/operations/flux3-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(error: string, status = 400, details?: unknown) {
  return NextResponse.json({ error, details }, { status });
}

export async function GET() {
  return NextResponse.json({ results: await listFlux3VideoOutputs() });
}

/**
 * Compatibility wrapper over the server-owned generation queue. FLUX.3 renders
 * run in the video lane; if this request times out, the queue keeps polling and
 * saving the result instead of losing an accepted job.
 */
export async function POST(request: NextRequest) {
  let body: Flux3RouteBody & { wait?: boolean };
  try {
    body = (await request.json()) as Flux3RouteBody;
  } catch {
    return jsonError("Request body must be valid JSON.");
  }

  const apiKey = await resolveApiKey(body.apiKey);
  if (!apiKey) return jsonError("FLUX API key is required.");

  return queueBackedResponse({
    enqueue: {
      kind: "video",
      operation: body.mode,
      title: body.title,
      body,
      origin: new URL(request.url).origin,
      apiKey,
      sourceAssetIds: [
        ...(Array.isArray(body.keyframeAssetIds) ? body.keyframeAssetIds : []),
        ...(body.draftCacheId ? [body.draftCacheId] : [])
      ].filter(Boolean)
    },
    wait: wantsWait(body as Record<string, unknown>),
    waitMs: VIDEO_ROUTE_WAIT_MS,
    fallbackError: "FLUX.3 video generation failed."
  });
}
