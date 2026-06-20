import { NextResponse } from "next/server";
import {
  agentRouteMap,
  localAgentCoverage,
  localDashboardMcpTools,
  localMcpParityNotes,
  mcpStatusRoutes,
  nativeFluxMcp
} from "@/lib/agent-routes";
import { apiKeyStatus } from "@/lib/server-api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keyStatus = await apiKeyStatus();
  return NextResponse.json({
    status: "ready",
    serverUrl: nativeFluxMcp.serverUrl,
    directBrowserClient: false,
    commands: nativeFluxMcp.install,
    apiRoutes: mcpStatusRoutes,
    apiKey: {
      configured: keyStatus.configured,
      source: keyStatus.source,
      statusRoute: agentRouteMap.apiKey,
      rawKeyReadableFromApi: false
    },
    guideRoute: agentRouteMap.mcpGuide,
    coverage: localAgentCoverage,
    localMcpWrapper: {
      tools: localDashboardMcpTools,
      coverage: localMcpParityNotes.wrapper,
      httpOnly: localMcpParityNotes.httpOnly
    },
    bridge: {
      mode: "browser-http-api-plus-agent-handoff",
      reason:
        "MCP OAuth and tool calls belong in an MCP-compatible client or a server-side proxy. This UI exposes local HTTP routes so agents can read prompts, plan batches, call FLUX API routes, sync remote archives, and recover outputs."
    }
  });
}
