import { NextRequest, NextResponse } from "next/server";
import {
  evaluationAnnotationPath,
  listGenerationEvaluations,
  updateGenerationEvaluation
} from "@/lib/generation-evaluation-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filtersFrom(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const parsedLimit = Number(query.get("limit"));
  return {
    id: query.get("id") || undefined,
    mediaType: query.get("mediaType") || undefined,
    model: query.get("model") || undefined,
    verdict: query.get("verdict") || undefined,
    search: query.get("search") || undefined,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined
  };
}

export async function GET(request: NextRequest) {
  try {
    const records = await listGenerationEvaluations(filtersFrom(request));
    if (request.nextUrl.searchParams.get("format") === "jsonl") {
      return new NextResponse(records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), {
        headers: { "content-type": "application/x-ndjson; charset=utf-8" }
      });
    }
    return NextResponse.json({
      schemaVersion: "bfl-evaluation/v1",
      records,
      count: records.length,
      annotationPath: evaluationAnnotationPath()
    });
  } catch {
    return NextResponse.json({ error: "Evaluation records are unreadable or corrupt." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = request.nextUrl.searchParams.get("id")?.trim() ||
    (body && typeof body === "object" ? String((body as Record<string, unknown>).id || "").trim() : "");
  if (!id) return NextResponse.json({ error: "Evaluation update requires an id." }, { status: 400 });
  try {
    const record = await updateGenerationEvaluation(id, body);
    if (!record) return NextResponse.json({ error: `Generation ${id} was not found.` }, { status: 404 });
    return NextResponse.json({ ok: true, record, annotationPath: evaluationAnnotationPath() });
  } catch {
    return NextResponse.json({ error: "Evaluation annotations are unreadable or corrupt." }, { status: 500 });
  }
}
