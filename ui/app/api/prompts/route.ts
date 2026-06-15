import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { compactPrompt } from "@/lib/prompt-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const promptsPath = path.resolve(process.cwd(), "../configs/cybernetic_flower_flux2_prompts.json");
  const raw = await readFile(promptsPath, "utf8");
  return NextResponse.json(JSON.parse(raw));
}

export async function POST(request: NextRequest) {
  const promptsPath = path.resolve(process.cwd(), "../configs/cybernetic_flower_flux2_prompts.json");
  const body = await request.json().catch(() => null);
  const incoming = body?.record || body;

  if (!incoming?.id || typeof incoming.prompt !== "string") {
    return NextResponse.json({ error: "Prompt save requires record.id and record.prompt" }, { status: 400 });
  }

  const raw = await readFile(promptsPath, "utf8");
  const records = JSON.parse(raw);
  const index = records.findIndex((record: any) => record.id === incoming.id);
  const saved = {
    ...(index >= 0 ? records[index] : {}),
    ...incoming,
    prompt: compactPrompt(incoming.prompt),
    prompt_format: incoming.prompt_format || (index >= 0 ? records[index].prompt_format : "json"),
    updated_at: new Date().toISOString()
  };

  if (index >= 0) records[index] = saved;
  else records.unshift(saved);

  await writeFile(promptsPath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return NextResponse.json({ ok: true, record: saved, path: promptsPath });
}

async function archiveDeletedPrompt(record: unknown) {
  // Soft-delete safety net: every removed prompt is appended to a trash file so an
  // accidental delete is always recoverable (kept last 200, newest first).
  const trashPath = path.resolve(process.cwd(), "../configs/deleted_prompts.json");
  let trash: unknown[] = [];
  try {
    trash = JSON.parse(await readFile(trashPath, "utf8"));
    if (!Array.isArray(trash)) trash = [];
  } catch {
    trash = [];
  }
  trash.unshift({ ...(record as Record<string, unknown>), deletedAt: new Date().toISOString() });
  await writeFile(trashPath, `${JSON.stringify(trash.slice(0, 200), null, 2)}\n`, "utf8");
}

export async function DELETE(request: NextRequest) {
  const promptsPath = path.resolve(process.cwd(), "../configs/cybernetic_flower_flux2_prompts.json");
  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Prompt delete requires an id" }, { status: 400 });
  }

  const raw = await readFile(promptsPath, "utf8");
  const records = JSON.parse(raw);
  const removed = records.find((record: any) => record.id === id);
  const nextRecords = records.filter((record: any) => record.id !== id);

  if (!removed) {
    return NextResponse.json({ error: `Prompt ${id} was not found` }, { status: 404 });
  }

  await archiveDeletedPrompt(removed);
  await writeFile(promptsPath, `${JSON.stringify(nextRecords, null, 2)}\n`, "utf8");
  return NextResponse.json({ ok: true, id, record: removed, path: promptsPath });
}
