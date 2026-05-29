import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildRunPlan, type RunPlanBody } from "@/lib/run-plan";
import type { PromptRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPTS_PATH = path.resolve(process.cwd(), "../configs/cybernetic_flower_flux2_prompts.json");

async function readPrompts() {
  const raw = await readFile(PROMPTS_PATH, "utf8");
  return JSON.parse(raw) as PromptRecord[];
}

export async function POST(request: NextRequest) {
  let body: RunPlanBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const prompts = await readPrompts();
  return NextResponse.json(buildRunPlan(prompts, body));
}
