import { NextResponse } from "next/server";
import { readRecipeMedia } from "@/lib/generation-recipe-store";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const media = await readRecipeMedia(file);
  if (!media) return NextResponse.json({ error: "Saved input not found." }, { status: 404 });
  return new Response(new Uint8Array(media.buffer), { headers: { "Content-Type": media.type,
    "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
