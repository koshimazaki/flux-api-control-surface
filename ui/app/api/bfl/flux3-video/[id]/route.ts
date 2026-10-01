import { NextRequest, NextResponse } from "next/server";
import { findFlux3VideoOutput } from "@/lib/flux3-video-server";
import { videoFileResponse } from "@/lib/video-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "draft-cache" ? "draft-cache" : "video";
  const output = await findFlux3VideoOutput(decodeURIComponent(id), kind);
  if (!output) return NextResponse.json({ error: "FLUX 3 output not found." }, { status: 404 });
  return videoFileResponse({
    filePath: output.filePath,
    contentType: output.contentType,
    fileName: output.fileName,
    request,
    download: url.searchParams.get("download") === "1"
  });
}
