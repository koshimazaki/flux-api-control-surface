import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { fetchRemoteImage } from "@/lib/remote-archive";
import { findLocalOutputImage } from "@/lib/server-output-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const source = new URL(request.url).searchParams.get("source");
  if (source === "remote") {
    const remote = await fetchRemoteImage(decodeURIComponent(id)).catch(() => null);
    if (remote) {
      return new NextResponse(remote.buffer, {
        headers: {
          "content-type": remote.contentType,
          "cache-control": "private, max-age=3600"
        }
      });
    }
  }

  const output = await findLocalOutputImage(decodeURIComponent(id));
  if (!output) {
    return NextResponse.json({ error: "Output image not found" }, { status: 404 });
  }

  const image = await readFile(output.imagePath);
  return new NextResponse(image, {
    headers: {
      "content-type": output.contentType,
      "cache-control": "private, max-age=3600"
    }
  });
}
