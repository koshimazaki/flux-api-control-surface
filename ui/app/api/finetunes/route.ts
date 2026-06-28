import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { removeFinetune, upsertFinetune } from "@/lib/finetune-registry";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import type { FinetuneRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Local finetune registry persisted to a gitignored config file (matches the
// /configs/local_*.json ignore rule), following the prompts route pattern.
function finetunesPath() {
  return path.resolve(process.cwd(), "../configs/local_finetunes.json");
}

// A missing file is an empty registry; a CORRUPT file throws so write paths
// refuse to overwrite (and silently lose) an unreadable registry.
async function readFinetunes(): Promise<FinetuneRecord[]> {
  let raw: string;
  try {
    raw = await readFile(finetunesPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
  const parsed = JSON.parse(raw);
  // Valid JSON of the wrong shape (e.g. an object) is still corrupt: returning []
  // here would let the next write silently clobber the real file.
  if (!Array.isArray(parsed)) throw new Error("Finetune registry is not an array.");
  return parsed;
}

// Atomic write: temp file + rename so a crash mid-write can't truncate the file.
async function writeFinetunes(records: FinetuneRecord[]) {
  const target = finetunesPath();
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

// Serialize read-modify-write so concurrent POST/DELETE can't lose updates.
let writeQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function GET() {
  try {
    return NextResponse.json(await readFinetunes());
  } catch {
    return NextResponse.json({ error: "Finetune registry file is unreadable or corrupt." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const incoming = body?.record ?? body;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "Finetune save requires a record with finetuneId" }, { status: 400 });
  }

  try {
    const outcome = await serialize<{ record?: FinetuneRecord; error?: string }>(async () => {
      const records = await readFinetunes();
      const { records: next, record, error } = upsertFinetune(records, incoming);
      if (error || !record) return { error: error || "Could not save finetune" };
      await writeFinetunes(next);
      return { record };
    });
    if (outcome.error || !outcome.record) {
      return NextResponse.json({ error: outcome.error || "Could not save finetune" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, record: outcome.record, path: toWorkspaceRelativePath(finetunesPath()) });
  } catch {
    return NextResponse.json({ error: "Finetune registry is unreadable; refusing to overwrite." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Finetune delete requires an id" }, { status: 400 });
  }

  try {
    const outcome = await serialize<{ removed?: FinetuneRecord }>(async () => {
      const records = await readFinetunes();
      const { records: next, removed } = removeFinetune(records, id);
      if (!removed) return {};
      await writeFinetunes(next);
      return { removed };
    });
    if (!outcome.removed) {
      return NextResponse.json({ error: `Finetune ${id} was not found` }, { status: 404 });
    }
    return NextResponse.json({ ok: true, id, record: outcome.removed, path: toWorkspaceRelativePath(finetunesPath()) });
  } catch {
    return NextResponse.json({ error: "Finetune registry is unreadable; refusing to overwrite." }, { status: 500 });
  }
}
