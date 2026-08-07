import { NextRequest, NextResponse } from "next/server";
import { planVideoScript, type VideoScriptPlanInput, type VideoScriptPrompt } from "@/lib/video-script-plan";
import { buildVideoScriptQueueJobs } from "@/lib/video-script/enqueue";
import { videoScriptPrompts } from "@/lib/video-script/plan-input";
import type { AssetCollection, PromptRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deterministic Video Script batch planning for agents: the same pure planner
 * the Script tab uses, exposed over HTTP. Planning is free and side-effect
 * free — the response carries the preview chain, per-row validation, and
 * queue-ready job drafts to submit through POST /api/dashboard/queue
 * (`enqueue_generation_jobs` over MCP) once the caller accepts the cost.
 */

type PlanRequestPool = {
  id?: string;
  label?: string;
  assetIds?: string[];
  /** Resolves the pool's members from a saved Asset Collection. */
  collectionId?: string;
};

type PlanRequestBody = {
  pools?: PlanRequestPool[];
  generator?: VideoScriptPlanInput["generator"];
  manualRows?: VideoScriptPlanInput["manualRows"];
  /** Inline prompt texts; positional "image 1/image 2" phrasing recommended. */
  prompts?: Array<{ id?: string; text: string }>;
  /** Prompt-library record ids, resolved server-side. */
  promptIds?: string[];
  promptMode?: VideoScriptPlanInput["promptMode"];
  promptSeparator?: string;
  timingMode?: VideoScriptPlanInput["timingMode"];
  timingTemplate?: number[];
  settings?: VideoScriptPlanInput["settings"];
  seed?: number;
  hardCap?: number;
  expansionLimit?: number;
  batchId?: string;
  batchLabel?: string;
};

async function readInternalJson(request: NextRequest, path: string) {
  const response = await fetch(new URL(path, request.url), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} responded with ${response.status}.`);
  return response.json();
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as PlanRequestBody | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Provide a JSON plan request body." }, { status: 400 });
  }

  try {
    const requestedPools = Array.isArray(body.pools) ? body.pools : [];
    const collectionIds = requestedPools
      .map((pool) => pool.collectionId)
      .filter((id): id is string => Boolean(id));
    let collections: AssetCollection[] = [];
    if (collectionIds.length) {
      const data = await readInternalJson(request, "/api/collections");
      collections = (Array.isArray(data) ? data : data.collections || []) as AssetCollection[];
    }

    const pools = requestedPools.map((pool, index) => {
      const collection = pool.collectionId
        ? collections.find((entry) => entry.id === pool.collectionId)
        : undefined;
      if (pool.collectionId && !collection) {
        throw new Error(`Collection ${pool.collectionId} was not found.`);
      }
      const memberIds = collection ? collection.members.map((member) => member.assetId) : [];
      return {
        id: pool.id || pool.collectionId || `pool_${index + 1}`,
        label: pool.label || collection?.name || pool.id || `Pool ${index + 1}`,
        assetIds: [...(pool.assetIds || []), ...memberIds]
      };
    });

    const inlinePrompts: VideoScriptPrompt[] = (Array.isArray(body.prompts) ? body.prompts : [])
      .filter((prompt) => typeof prompt?.text === "string" && prompt.text.trim())
      .map((prompt, index) => ({ id: prompt.id || `inline_${index + 1}`, text: prompt.text }));
    let libraryPrompts: VideoScriptPrompt[] = [];
    if (Array.isArray(body.promptIds) && body.promptIds.length) {
      const data = await readInternalJson(request, "/api/prompts");
      const records = (Array.isArray(data) ? data : data.prompts || []) as PromptRecord[];
      libraryPrompts = videoScriptPrompts(records, body.promptIds);
      const missing = body.promptIds.filter((id) => !libraryPrompts.some((prompt) => prompt.id === id));
      if (missing.length) throw new Error(`Prompt record${missing.length === 1 ? "" : "s"} not found: ${missing.join(", ")}.`);
    }

    const plan = planVideoScript({
      pools,
      generator: body.generator,
      manualRows: body.manualRows,
      prompts: [...libraryPrompts, ...inlinePrompts],
      promptMode: body.promptMode,
      promptSeparator: body.promptSeparator,
      timingMode: body.timingMode,
      timingTemplate: body.timingTemplate,
      settings: body.settings,
      seed: body.seed,
      hardCap: body.hardCap,
      expansionLimit: body.expansionLimit
    });

    const blocked = plan.rows
      .filter((row) => row.errors.length)
      .map((row) => ({ id: row.id, errors: row.errors }));
    const batchId = body.batchId || `vsb_${Date.now().toString(36)}`;
    const jobs = buildVideoScriptQueueJobs(plan, {
      batchId,
      sourceCollectionIds: collectionIds,
      batchLabel: body.batchLabel
    });

    return NextResponse.json({
      batchId,
      preview: plan.preview,
      warnings: plan.warnings,
      rows: plan.rows,
      blocked,
      jobs,
      // Planning never spends; this is the exact follow-up call that does.
      enqueueWith: { route: "/api/dashboard/queue", mcpTool: "enqueue_generation_jobs", body: { jobs, wait: false } }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not plan this video script batch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
