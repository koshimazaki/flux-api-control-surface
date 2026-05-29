import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { estimateTokens, modelOptions } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPTS_PATH = path.resolve(process.cwd(), "../configs/cybernetic_flower_flux2_prompts.json");
const OUTPUT_ROOT = path.resolve(process.cwd(), "..", "outputs", "bfl-api-dashboard");

type PromptRecord = {
  id: string;
  species?: string;
  seed?: number;
  prompt: string;
  location?: string;
  lighting?: string;
  plant_form?: string;
};

async function walk(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const children = await Promise.all(
      entries.map((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath]);
      })
    );
    return children.flat();
  } catch {
    return [];
  }
}

function compactPrompt(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

async function readPrompts() {
  const raw = await readFile(PROMPTS_PATH, "utf8");
  return JSON.parse(raw) as PromptRecord[];
}

async function readOutputManifest() {
  const files = await walk(OUTPUT_ROOT);
  const metadataFiles = files.filter((file) => file.endsWith(".json")).sort().reverse();

  return Promise.all(
    metadataFiles.map(async (metadataPath) => {
      const base = metadataPath.replace(/\.json$/, "");
      const imagePath =
        files.find(
          (file) => file === `${base}.jpg` || file === `${base}.jpeg` || file === `${base}.png` || file === `${base}.webp`
        ) || "";
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      const fileStat = imagePath ? await stat(imagePath).catch(() => null) : null;

      return {
        id: metadata.id || path.basename(base),
        title: path.basename(base),
        model: metadata.model,
        promptTokens: estimateTokens(metadata.payload?.prompt || ""),
        imagePath,
        promptPath: `${base}.prompt.txt`,
        metadataPath,
        sampleUrl: metadata.sampleUrl,
        costCredits: metadata.submit?.cost ?? metadata.submit?.creditDelta ?? null,
        creditsBefore: metadata.submit?.creditsBefore ?? null,
        creditsAfter: metadata.submit?.creditsAfter ?? null,
        createdAt: fileStat?.birthtime.toISOString() || null
      };
    })
  );
}

export async function GET() {
  const [prompts, outputs] = await Promise.all([readPrompts(), readOutputManifest()]);

  return NextResponse.json({
    name: "BFL API Dashboard",
    purpose: "Local UI and agent API for FLUX.2 prompt permutations, BFL generation, output recovery, costs, and logs.",
    routes: {
      prompts: "/api/prompts",
      dashboardContext: "/api/dashboard/context",
      runPlan: "/api/dashboard/run-plan",
      batch: "/api/dashboard/batch",
      generate: "/api/bfl/generate",
      credits: "/api/bfl/credits",
      outputs: "/api/outputs",
      mcpStatus: "/api/mcp/status",
      mcpManifest: "/api/mcp/manifest"
    },
    auth: {
      browserKeyOptional: true,
      serverEnv: ["BFL_API_KEY", "FLUX_API_KEY"]
    },
    models: modelOptions,
    prompts: prompts.map((prompt) => ({
      id: prompt.id,
      species: prompt.species,
      seed: prompt.seed,
      location: prompt.location,
      lighting: prompt.lighting,
      plant_form: prompt.plant_form,
      prompt: compactPrompt(prompt.prompt),
      promptTokens: estimateTokens(compactPrompt(prompt.prompt))
    })),
    outputs
  });
}
