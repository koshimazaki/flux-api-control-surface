import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { findFlux3VideoOutput } from "@/lib/flux3-video-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "draft-cache" ? "draft-cache" : "video";
  const output = await findFlux3VideoOutput(decodeURIComponent(id), kind);
  if (!output) return NextResponse.json({ error: "FLUX.3 output not found." }, { status: 404 });

  const headers: Record<string, string> = {
    "content-type": output.contentType,
    "cache-control": "private, max-age=3600"
  };
  if (url.searchParams.get("download") === "1") {
    headers["content-disposition"] = `attachment; filename="${output.fileName.replace(/"/g, "")}"`;
  }
  return new NextResponse(await readFile(output.filePath), { headers });
}
