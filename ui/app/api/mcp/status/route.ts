import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ready",
    serverUrl: "https://mcp.bfl.ai",
    directBrowserClient: false,
    commands: {
      add: "codex mcp add FLUX --url https://mcp.bfl.ai",
      login: "codex mcp login FLUX",
      list: "codex mcp list"
    },
    apiRoutes: [
      "/api/dashboard/context",
      "/api/dashboard/run-plan",
      "/api/dashboard/batch",
      "/api/bfl/generate",
      "/api/bfl/credits",
      "/api/outputs",
      "/api/mcp/status",
      "/api/mcp/manifest"
    ],
    bridge: {
      mode: "browser-http-api-plus-agent-handoff",
      reason:
        "MCP OAuth and tool calls belong in an MCP-compatible client or a server-side proxy. This UI exposes local HTTP routes so agents can read prompts, plan batches, call BFL API routes, sync remote archives, and recover outputs."
    }
  });
}
