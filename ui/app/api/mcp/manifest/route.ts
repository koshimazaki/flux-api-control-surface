import { NextResponse } from "next/server";
import { modelOptions } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: "BFL API Dashboard MCP Surface",
    version: "0.2.0",
    description:
      "Local HTTP surface for MCP clients and agents to use the BFL API Dashboard without scraping the browser UI.",
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
          purpose: "Browse previous BFL generations."
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
          promptIds: ["passion_flower_01", "sea_anemone_flower_02", "rafflesia_01"],
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
        purpose: "Plan or execute a sequential dashboard batch that saves image, prompt, and metadata files.",
        sideEffects: "Only when execute=true",
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body.",
        example: {
          execute: false,
          batchMode: "library",
          startId: "passion_flower_01",
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
        purpose: "Call BFL HTTP API once, poll result, save files under BFL/outputs/bfl-api-dashboard/YYYY-MM-DD.",
        sideEffects: true,
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body."
      },
      {
        method: "POST",
        path: "/api/bfl/credits",
        purpose: "Check BFL credits through the dashboard server.",
        sideEffects: false,
        auth: "Uses BFL_API_KEY/FLUX_API_KEY server env or apiKey in request body."
      },
      {
        method: "GET",
        path: "/api/outputs",
        purpose: "Hydrate saved filesystem outputs back into the dashboard gallery.",
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
      "Use /api/dashboard/batch with execute=true when the dashboard should save dataset files.",
      "Use native FLUX MCP directly when the MCP client should own generation/history/credits instead of this local dashboard."
    ],
    safety: {
      avoidBrowserStoredKeys: true,
      preferredSecretEnv: ["BFL_API_KEY", "FLUX_API_KEY"],
      batchExecutionCanSpendCredits: true
    }
  });
}
