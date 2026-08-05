import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey } from "@/lib/bfl-server";
import { getBflImageTool } from "@/lib/provider-registry";
import { IMAGE_ROUTE_WAIT_MS, queueBackedResponse, wantsWait } from "@/lib/queue/http";
import type { ToolBody } from "@/lib/operations/image-tool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

/**
 * Compatibility wrapper over the server-owned generation queue. Erase, VTO,
 * outpaint, and deblur all execute in the tool lane through the same submit,
 * poll-step, and finalize services as every other paid operation.
 */
export async function POST(request: NextRequest) {
  let body: ToolBody & { wait?: boolean };
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const apiKey = await resolveApiKey(body.apiKey);
  const tool = body.tool;
  const toolConfig = tool ? getBflImageTool(tool) : undefined;
  if (!apiKey) return jsonError("FLUX API key is required");
  if (!tool || !toolConfig) return jsonError(`Unknown tool: ${tool || "(none)"}`);

  return queueBackedResponse({
    enqueue: {
      kind: "tool",
      operation: tool,
      title: body.title,
      body,
      origin: new URL(request.url).origin,
      apiKey,
      sourceAssetIds: [body.sourceAssetId, ...(body.garmentAssetIds || [])].filter((value): value is string =>
        Boolean(value)
      )
    },
    wait: wantsWait(body as Record<string, unknown>),
    waitMs: IMAGE_ROUTE_WAIT_MS,
    fallbackError: `${tool} run failed`
  });
}
