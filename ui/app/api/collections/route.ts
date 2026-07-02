import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import {
  createAssetCollection,
  mergeCollectionMembers,
  normalizeAssetCollections,
  normalizeCollectionMember,
  removeCollectionMember,
  upsertAssetCollection
} from "@/lib/asset-collections";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import { OUTPUT_ROOT } from "@/lib/server-output-store";
import type { AssetCollection, AssetCollectionMember } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function collectionsDir() {
  return path.join(OUTPUT_ROOT, ".collections");
}

function collectionsPath() {
  return path.join(collectionsDir(), "collections.json");
}

async function readCollections() {
  let raw: string;
  try {
    raw = await readFile(collectionsPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
  return normalizeAssetCollections(JSON.parse(raw));
}

async function writeCollections(collections: AssetCollection[]) {
  await mkdir(collectionsDir(), { recursive: true });
  const target = collectionsPath();
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(collections, null, 2)}\n`, "utf8");
  await rename(tmp, target);
}

let writeQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function membersFrom(value: unknown): AssetCollectionMember[] {
  return Array.isArray(value)
    ? value.map(normalizeCollectionMember).filter((member): member is AssetCollectionMember => Boolean(member))
    : [];
}

function collectionResponse(collections: AssetCollection[], collection?: AssetCollection) {
  return {
    ok: true,
    collection,
    collections,
    path: toWorkspaceRelativePath(collectionsPath())
  };
}

export async function GET(request: NextRequest) {
  try {
    const collections = await readCollections();
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) return NextResponse.json(collections);
    const collection = collections.find((item) => item.id === id);
    if (!collection) return NextResponse.json({ error: `Collection ${id} was not found` }, { status: 404 });
    return NextResponse.json(collection);
  } catch {
    return NextResponse.json({ error: "Collection store is unreadable or corrupt." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Collection create requires a JSON body." }, { status: 400 });
  }

  try {
    const outcome = await serialize(async () => {
      const collections = await readCollections();
      const collection = createAssetCollection({
        name: (body as Record<string, unknown>).name,
        description: (body as Record<string, unknown>).description,
        members: (body as Record<string, unknown>).members,
        cover: (body as Record<string, unknown>).cover,
        favorite: (body as Record<string, unknown>).favorite
      });
      const next = upsertAssetCollection(collections, collection);
      await writeCollections(next);
      return collectionResponse(next, collection);
    });
    return NextResponse.json(outcome);
  } catch {
    return NextResponse.json({ error: "Collection store is unreadable; refusing to overwrite." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = request.nextUrl.searchParams.get("id")?.trim() || (body && typeof body === "object" ? String((body as Record<string, unknown>).id || "").trim() : "");
  if (!id) return NextResponse.json({ error: "Collection update requires an id." }, { status: 400 });

  try {
    const outcome = await serialize(async () => {
      const collections = await readCollections();
      const existing = collections.find((item) => item.id === id);
      if (!existing) return { error: `Collection ${id} was not found`, status: 404 };
      const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
      const replacementMembers = raw.members === undefined ? existing.members : membersFrom(raw.members);
      const addMembers = membersFrom(raw.addMembers);
      const nextCollection: AssetCollection = {
        ...existing,
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : existing.name,
        description: typeof raw.description === "string" ? raw.description.trim() || undefined : existing.description,
        favorite: typeof raw.favorite === "boolean" ? raw.favorite : existing.favorite,
        cover: Array.isArray(raw.cover)
          ? raw.cover.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean).slice(0, 4)
          : existing.cover,
        members: mergeCollectionMembers(replacementMembers, addMembers),
        updatedAt: Date.now()
      };
      const next = upsertAssetCollection(collections, nextCollection);
      await writeCollections(next);
      return collectionResponse(next, nextCollection);
    });
    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json(outcome);
  } catch {
    return NextResponse.json({ error: "Collection store is unreadable; refusing to overwrite." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const assetId = request.nextUrl.searchParams.get("assetId")?.trim();
  if (!id) return NextResponse.json({ error: "Collection delete requires an id." }, { status: 400 });

  try {
    const outcome = await serialize(async () => {
      const collections = await readCollections();
      const existing = collections.find((item) => item.id === id);
      if (!existing) return { error: `Collection ${id} was not found`, status: 404 };
      if (assetId) {
        const nextCollection = removeCollectionMember(existing, assetId);
        const next = upsertAssetCollection(collections, nextCollection);
        await writeCollections(next);
        return collectionResponse(next, nextCollection);
      }
      const next = collections.filter((item) => item.id !== id);
      await writeCollections(next);
      return collectionResponse(next);
    });
    if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json(outcome);
  } catch {
    return NextResponse.json({ error: "Collection store is unreadable; refusing to overwrite." }, { status: 500 });
  }
}
