import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/bfl-server";
import type { VideoEditRouteBody } from "@/lib/operations/video-edit";
import { VIDEO_ROUTE_WAIT_MS, queueBackedResponse, wantsWait } from "@/lib/queue/http";
import { VIDEO_EDIT_OPERATION } from "@/lib/video-edit";
import { listVideoEditOutputs } from "@/lib/video-edit-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  return NextResponse.json({ results: await listVideoEditOutputs() });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as VideoEditRouteBody | null;
  if (!body) return jsonError("Request body must be valid JSON.");
  const apiKey = await resolveApiKey(body.apiKey);
  if (!apiKey) return jsonError("FLUX API key is required.");
  return queueBackedResponse({
    enqueue: {
      kind: "video",
      operation: VIDEO_EDIT_OPERATION,
      title: body.title,
      body: { ...body, operation: VIDEO_EDIT_OPERATION },
      origin: new URL(request.url).origin,
      apiKey,
      sourceAssetIds: body.sourceAssetId ? [body.sourceAssetId] : []
    },
    wait: wantsWait(body as Record<string, unknown>),
    waitMs: VIDEO_ROUTE_WAIT_MS,
    fallbackError: "FLUX Video Edit failed."
  });
}
