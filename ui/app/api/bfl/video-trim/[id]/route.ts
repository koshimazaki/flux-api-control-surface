import { NextRequest, NextResponse } from "next/server";
import { videoFileResponse } from "@/lib/video-file-response";
import { findVideoTrimOutput } from "@/lib/video-trim-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const output = await findVideoTrimOutput(decodeURIComponent(id));
  if (!output) return NextResponse.json({ error: "Cut video not found." }, { status: 404 });
  return videoFileResponse({
    filePath: output.filePath,
    contentType: output.contentType,
    fileName: output.fileName,
    request,
    download: new URL(request.url).searchParams.get("download") === "1"
  });
}
