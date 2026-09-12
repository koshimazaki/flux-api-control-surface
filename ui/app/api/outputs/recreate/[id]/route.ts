import { NextResponse } from "next/server";
import { readGenerationRecipe } from "@/lib/generation-recipe-store";
import { readLegacyGenerationRecipe } from "@/lib/legacy-generation-recipe";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || id.length > 300) return NextResponse.json({ error: "Invalid asset ID." }, { status: 400 });
  try {
    const recipe = await readGenerationRecipe(id) || await readLegacyGenerationRecipe(id);
    return NextResponse.json({ recipe }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not read the saved settings." }, { status: 500 }); }
}
