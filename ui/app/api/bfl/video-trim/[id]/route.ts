import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { findVideoTrimOutput } from "@/lib/video-trim-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const output = await findVideoTrimOutput(decodeURIComponent(id));
  if (!output) return NextResponse.json({ error: "Cut video not found." }, { status: 404 });
  const headers: Record<string, string> = {
    "content-type": output.contentType,
    "cache-control": "private, max-age=3600"
  };
  if (new URL(request.url).searchParams.get("download") === "1") {
    headers["content-disposition"] = `attachment; filename="${output.fileName.replace(/"/g, "")}"`;
  }
  return new NextResponse(await readFile(output.filePath), { headers });
}
