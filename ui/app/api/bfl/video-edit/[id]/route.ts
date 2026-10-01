import { NextRequest, NextResponse } from "next/server";
import { videoFileResponse } from "@/lib/video-file-response";
import { findVideoEditOutput } from "@/lib/video-edit-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "source" ? "source" : "video";
  const output = await findVideoEditOutput(decodeURIComponent(id), kind);
  if (!output) return NextResponse.json({ error: "Video Edit output not found." }, { status: 404 });
  return videoFileResponse({
    filePath: output.filePath,
    contentType: output.contentType,
    fileName: output.fileName,
    request,
    download: url.searchParams.get("download") === "1"
  });
}
