import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/bfl-server";
import { FLUX3_IMAGE_OPERATION, type Flux3ImageRouteBody } from "@/lib/operations/flux3-image";
import { IMAGE_ROUTE_WAIT_MS, SLOW_IMAGE_ROUTE_WAIT_MS, queueBackedResponse, wantsWait } from "@/lib/queue/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status = 400, details?: unknown) {
  return NextResponse.json({ error, details }, { status });
}

/**
 * FLUX 3 Image (`POST /v1/flux-3-image`) through the server-owned queue, in
 * the image lane: text to image, image to image with up to ten references, or
 * a whole-image edit. Validation, submission, polling and saving run in the
 * queue, as for FLUX.2, so a dropped connection never orphans a paid job.
 */
export async function POST(request: NextRequest) {
  let body: Flux3ImageRouteBody & { wait?: boolean };
  try {
    body = (await request.json()) as Flux3ImageRouteBody;
  } catch {
    return jsonError("Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Request body must be a JSON object.");

  const apiKey = await resolveApiKey(body.apiKey);
  if (!apiKey) return jsonError("FLUX API key is required.");

  return queueBackedResponse({
    enqueue: {
      kind: "image",
      operation: FLUX3_IMAGE_OPERATION,
      title: body.title,
      body: { ...body, operation: FLUX3_IMAGE_OPERATION },
      origin: new URL(request.url).origin,
      apiKey,
      sourceAssetIds: Array.isArray(body.sourceAssetIds) ? body.sourceAssetIds : undefined
    },
    wait: wantsWait(body as Record<string, unknown>),
    waitMs: body.settings?.resolution === "4k" ? SLOW_IMAGE_ROUTE_WAIT_MS : IMAGE_ROUTE_WAIT_MS,
    fallbackError: "FLUX 3 Image generation failed."
  });
}
