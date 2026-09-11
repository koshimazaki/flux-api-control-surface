import { NextRequest, NextResponse } from "next/server";
import { readTrimProgress } from "@/lib/video-trim-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the cut timeline while ffmpeg runs, so the button can show a real percentage. */
export async function GET(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "A progress id is required." }, { status: 400 });
  return NextResponse.json({ progress: readTrimProgress(id) });
}
