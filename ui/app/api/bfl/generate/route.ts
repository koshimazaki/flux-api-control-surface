import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/bfl-server";
import { IMAGE_ROUTE_WAIT_MS, queueBackedResponse, wantsWait } from "@/lib/queue/http";
import type { GenerateBody } from "@/lib/operations/image-generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

async function readGenerateBody(request: NextRequest): Promise<GenerateBody> {
  const raw = await request.text();
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const isJsonRequest = request.headers.get("content-type")?.toLowerCase().includes("application/json");

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as GenerateBody;
    }
    return { prompt: typeof parsed === "string" ? parsed : raw };
  } catch {
    if (isJsonRequest) {
      throw new Error("Request body must be valid JSON.");
    }
    return { prompt: raw };
  }
}

/**
 * Compatibility wrapper over the server-owned generation queue. Validation,
 * submission, polling, download, and saving all happen in the queue runner, so a
 * dropped connection can no longer orphan an accepted BFL request.
 */
export async function POST(request: NextRequest) {
  let body: GenerateBody & { wait?: boolean };
  try {
    body = await readGenerateBody(request);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not read request body");
  }

  const apiKey = await resolveApiKey(body.apiKey);
  if (!apiKey) return jsonError("FLUX API key is required");

  return queueBackedResponse({
    enqueue: {
      kind: "image",
      operation: "generate",
      title: body.title,
      body,
      origin: new URL(request.url).origin,
      apiKey,
      sourceAssetIds: Array.isArray(body.sourceAssetIds) ? body.sourceAssetIds : undefined
    },
    wait: wantsWait(body as Record<string, unknown>),
    waitMs: IMAGE_ROUTE_WAIT_MS,
    fallbackError: "Generation failed"
  });
}
