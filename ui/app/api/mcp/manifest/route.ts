import { NextResponse } from "next/server";
import { modelOptions } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "FLUX API Control Surface MCP Surface",
    version: "0.2.0",
    description:
      "Local HTTP surface for MCP clients and agents to use the FLUX API Control Surface without scraping the browser UI.",
    nativeFluxMcp: {
      serverUrl: "https://mcp.bfl.ai",
      install: {
        add: "codex mcp add FLUX --url https://mcp.bfl.ai",
        login: "codex mcp login FLUX"
      },
      tools: [
        {
          name: "generate_image",
          purpose: "Generate one image or a small parallel batch with FLUX models.",
          notes: "Native BFL MCP is ideal when an MCP client should call BFL directly."
        },
        {
          name: "generate_variations",
          purpose: "Create variations from a previous BFL request."
        },
        {
          name: "get_history",
          purpose: "Browse previous FLUX generations."
        },
        {
          name: "get_credits",
          purpose: "Check BFL credit balance."
        }
      ]
    },
    dashboardRoutes: [
      {
        method: "GET",
        path: "/api/mcp/manifest",
        purpose: "Describe all local agent/MCP-facing routes and native FLUX MCP handoff options.",
        sideEffects: false
      },
      {
        method: "GET",
        path: "/api/dashboard/context",
        purpose: "Return models, prompts, output metadata, auth expectations, and route map.",
        sideEffects: false
      },
      {
        method: "POST",
        path: "/api/dashboard/run-plan",
        purpose: "Build concrete generation request bodies from prompt IDs, prompt queue, or inline prompt.",
        sideEffects: false,
        example: {
          batchMode: "permutations",
          promptIds: ["tropical_membrane_flower_01", "sea_anemone_flower_02", "rafflesia_01"],
          permutationSize: 2,
          count: 10,
          parallel: 4,
          model: "pro-preview",
          width: 1024,
          height: 1024,
          outputFormat: "png"
        }
      },
      {
        method: "POST",
        path: "/api/dashboard/batch",
        purpose: "Plan or execute a sequential control-surface batch that saves image, prompt, and metadata locally and, when configured, to R2/D1.",
        sideEffects: "Only when execute=true",
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body.",
        example: {
          execute: false,
          batchMode: "library",
          startId: "tropical_membrane_flower_01",
          count: 10,
          model: "pro-preview",
          width: 1024,
          height: 1024,
          outputFormat: "png"
        }
      },
      {
        method: "POST",
        path: "/api/bfl/generate",
        purpose: "Call the FLUX HTTP API once, poll result, save files under BFL/outputs/flux-api-control-surface/YYYY-MM-DD, and optionally sync the archive Worker.",
        sideEffects: true,
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body."
      },
      {
        method: "POST",
        path: "/api/bfl/tools",
        purpose:
          "Run FLUX image tools on an existing image: erase (flux-tools/erase-v1, white mask = remove), inpaint (flux-pro-1.0-fill, mask + prompt), outpaint (flux-tools/outpainting-v1, target canvas + offsets + high/fast mode). Saves outputs like /api/bfl/generate and records sourceAssetId provenance.",
        sideEffects: true,
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body.",
        example: {
          tool: "outpaint",
          image: "https://... or data:image/png;base64,...",
          canvasWidth: 1536,
          canvasHeight: 1024,
          offsetX: 256,
          offsetY: null,
          mode: "high",
          prompt: "extend the botanical scene"
        }
      },
      {
        method: "POST",
        path: "/api/bfl/credits",
        purpose: "Check FLUX API credits through the control-surface server.",
        sideEffects: false,
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body."
      },
      {
        method: "POST",
        path: "/api/audio/guide",
        purpose: "Render the audio-reactive shader guide video (MP4 via ffmpeg) from an analysis + marker payload.",
        sideEffects: false
      },
      {
        method: "POST",
        path: "/api/audio/slice",
        purpose: "Cut and loop an audio slice to mp3/wav for video-model inputs.",
        sideEffects: false
      },
      {
        method: "GET",
        path: "/api/reference-archive",
        purpose: "List or browse the synced training reference archive (R2/D1).",
        sideEffects: false
      },
      {
        method: "GET",
        path: "/api/outputs",
        purpose: "Hydrate saved filesystem and configured R2/D1 archive outputs back into the dashboard gallery.",
        sideEffects: false
      },
      {
        method: "GET",
        path: "/api/prompts",
        purpose: "Return the cybernetic flower prompt library.",
        sideEffects: false
      },
      {
        method: "GET",
        path: "/api/mcp/status",
        purpose: "Return short operational status for the MCP tab.",
        sideEffects: false
      }
    ],
    models: modelOptions,
    recommendedFlows: [
      "Use /api/dashboard/context to discover prompts and outputs.",
      "Use /api/dashboard/run-plan for a dry-run request plan with costs.",
      "Use /api/dashboard/batch with execute=true when the dashboard should save dataset files and sync remote archive storage.",
      "Use native FLUX MCP directly when the MCP client should own generation/history/credits instead of this local control surface."
    ],
    safety: {
      avoidBrowserStoredKeys: true,
      preferredSecretEnv: ["BFL_API_KEY", "FLUX_API_KEY"],
      batchExecutionCanSpendCredits: true
    }
  });
}
