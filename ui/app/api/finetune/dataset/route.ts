import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { buildKleinLoraDataset, type KleinLoraConfigOptions, type KleinLoraDataset } from "@/lib/finetune-dataset";
import { toWorkspaceRelativePath } from "@/lib/local-paths";
import type { TrainingCollection } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Build a FLUX.2 [klein] LoRA dataset (flat image + .txt sidecars, config.yaml,
// README.md) from a training collection and persist it under the shared outputs
// dir, mirroring the caption_agent job-folder pattern so it is MCP-reachable.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const collection = (body?.collection || body) as Partial<TrainingCollection> | undefined;
  const items = collection?.items;

  if (!collection || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Dataset export requires a collection with items" }, { status: 400 });
  }

  const options: KleinLoraConfigOptions =
    body?.config && typeof body.config === "object" ? body.config : {};

  // buildKleinLoraDataset validates the payload (image magic bytes, per-image size,
  // item count). Those are client errors, so surface them as 400s rather than
  // letting them bubble up as unhandled 500s with a stack trace.
  let dataset: KleinLoraDataset;
  try {
    dataset = buildKleinLoraDataset(collection as TrainingCollection, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid collection for dataset export.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const collectionName = collection.name || "klein-lora";
  const rootDir = path.resolve(process.cwd(), "..", "outputs", "flux-api-control-surface", "finetune-datasets");
  const jobDir = path.join(rootDir, `${stamp}_${slugify(collectionName) || "collection"}`);

  const written: string[] = [];
  for (const file of dataset.files) {
    const target = path.join(jobDir, file.name);
    // Defense in depth: dataset file names are app-generated, but never let a
    // write escape the job folder.
    if (!target.startsWith(`${jobDir}${path.sep}`) && target !== jobDir) {
      return NextResponse.json({ error: `Refusing to write outside dataset folder: ${file.name}` }, { status: 400 });
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof file.content === "string" ? Buffer.from(file.content, "utf8") : Buffer.from(file.content));
    written.push(file.name);
  }

  return NextResponse.json({
    ok: true,
    triggerToken: dataset.triggerToken,
    imageCount: dataset.imageCount,
    datasetDir: toWorkspaceRelativePath(jobDir),
    imagesDir: toWorkspaceRelativePath(path.join(jobDir, dataset.datasetDir)),
    configPath: toWorkspaceRelativePath(path.join(jobDir, dataset.configFileName)),
    readmePath: toWorkspaceRelativePath(path.join(jobDir, dataset.readmeFileName)),
    config: dataset.config,
    files: written
  });
}
