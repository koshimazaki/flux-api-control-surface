import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/bfl-server";
import type { VideoUpscaleRouteBody } from "@/lib/operations/video-upscale";
import { VIDEO_ROUTE_WAIT_MS, queueBackedResponse, wantsWait } from "@/lib/queue/http";
import { VIDEO_UPSCALE_OPERATION } from "@/lib/video-upscale";
import { listVideoUpscaleOutputs } from "@/lib/video-upscale-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  return NextResponse.json({ results: await listVideoUpscaleOutputs() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as VideoUpscaleRouteBody | null;
  if (!body) return jsonError("Request body must be valid JSON.");
  const apiKey = await resolveApiKey(body.apiKey);
  if (!apiKey) return jsonError("FLUX API key is required.");
  return queueBackedResponse({
    enqueue: {
      kind: "video",
      operation: VIDEO_UPSCALE_OPERATION,
      title: body.title,
      body: { ...body, operation: VIDEO_UPSCALE_OPERATION },
      origin: new URL(request.url).origin,
      apiKey,
      sourceAssetIds: body.sourceAssetId ? [body.sourceAssetId] : []
    },
    wait: wantsWait(body as Record<string, unknown>),
    waitMs: VIDEO_ROUTE_WAIT_MS,
    fallbackError: "FLUX 3 Video Upscale failed."
  });
}
