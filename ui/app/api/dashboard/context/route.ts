import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  agentRouteMap,
  dashboardAgentRoutes,
  localAgentCoverage,
  localDashboardMcpTools,
  localMcpParityNotes
} from "@/lib/agent-routes";
import { fetchRemoteOutputManifest, remoteArchiveStatus } from "@/lib/remote-archive";
import { apiKeyStatus } from "@/lib/server-api-key";
import { readLocalOutputManifest } from "@/lib/server-output-store";
import { estimateTokens, modelOptions } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPTS_PATH = path.resolve(process.cwd(), "../configs/cybernetic_flower_flux2_prompts.json");

type PromptRecord = {
  id: string;
  species?: string;
  seed?: number;
  prompt: string;
  location?: string;
  lighting?: string;
  plant_form?: string;
};

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

export async function GET() {
  const [prompts, localOutputs, remoteOutputs, keyStatus] = await Promise.all([
    readPrompts(),
    readLocalOutputManifest(),
    fetchRemoteOutputManifest().catch(() => []),
    apiKeyStatus()
  ]);

  return NextResponse.json({
    name: "FLUX API Control Surface",
    purpose: "Local UI and agent API for FLUX.2 prompt permutations, image generation, output recovery, costs, and logs.",
    routes: agentRouteMap,
    agentRoutes: dashboardAgentRoutes,
    coverage: localAgentCoverage,
    localMcpWrapper: {
      tools: localDashboardMcpTools,
      coverage: localMcpParityNotes.wrapper,
      httpOnly: localMcpParityNotes.httpOnly
    },
    guideRoute: agentRouteMap.mcpGuide,
    auth: {
      browserKeyOptional: true,
      serverEnv: ["BFL_API_KEY", "FLUX_API_KEY"],
      serverKeyConfigured: keyStatus.configured,
      serverKeySource: keyStatus.source,
      macOsKeychain: keyStatus.keychain,
      statusRoute: agentRouteMap.apiKey,
      remoteArchiveEnv: ["BFL_ASSET_WORKER_URL", "BFL_ASSET_WORKER_TOKEN"]
    },
    remoteArchive: remoteArchiveStatus(),
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
    outputs: [...remoteOutputs, ...localOutputs]
  });
}
