import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { findVideoUpscaleOutput } from "@/lib/video-upscale-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "source" ? "source" : "video";
  const output = await findVideoUpscaleOutput(decodeURIComponent(id), kind);
  if (!output) return NextResponse.json({ error: "Video Upscale output not found." }, { status: 404 });
  const headers: Record<string, string> = {
    "content-type": output.contentType,
    "cache-control": "private, max-age=3600"
  };
  if (url.searchParams.get("download") === "1") {
    headers["content-disposition"] = `attachment; filename="${output.fileName.replace(/"/g, "")}"`;
  }
  return new NextResponse(await readFile(output.filePath), { headers });
}
