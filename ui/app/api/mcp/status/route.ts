import { NextResponse } from "next/server";
import { localAgentCoverage, mcpStatusRoutes, nativeFluxMcp } from "@/lib/agent-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ready",
    serverUrl: nativeFluxMcp.serverUrl,
    directBrowserClient: false,
    commands: nativeFluxMcp.install,
    apiRoutes: mcpStatusRoutes,
    coverage: localAgentCoverage,
    bridge: {
      mode: "browser-http-api-plus-agent-handoff",
      reason:
        "MCP OAuth and tool calls belong in an MCP-compatible client or a server-side proxy. This UI exposes local HTTP routes so agents can read prompts, plan batches, call FLUX API routes, sync remote archives, and recover outputs."
    }
  });
}
