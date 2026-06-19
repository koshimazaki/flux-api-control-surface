import { NextResponse } from "next/server";
import { agentWorkflowGuide } from "@/lib/agent-guide";
import { dashboardAgentRoutes, localAgentCoverage, nativeFluxMcp } from "@/lib/agent-routes";
import { modelOptions } from "@/lib/pricing";
import { apiKeyStatus } from "@/lib/server-api-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keyStatus = await apiKeyStatus();
  return NextResponse.json({
    name: "FLUX API Control Surface MCP Surface",
    version: "0.2.0",
    description:
      "Local HTTP surface for MCP clients and agents to use the FLUX API Control Surface without scraping the browser UI.",
    nativeFluxMcp,
    dashboardRoutes: dashboardAgentRoutes,
    coverage: localAgentCoverage,
    guide: agentWorkflowGuide,
    models: modelOptions,
    recommendedFlows: [
      "Use /api/mcp/guide to choose between hosted FLUX MCP and the local workbench API.",
      "Use /api/dashboard/context to discover prompts and outputs.",
      "Use /api/dashboard/run-plan for a dry-run request plan with costs.",
      "Use /api/dashboard/batch with execute=true when the dashboard should save dataset files and sync remote archive storage.",
      "Use native FLUX MCP directly when the MCP client should own generation/history/credits instead of this local control surface."
    ],
    safety: {
      avoidBrowserStoredKeys: true,
      preferredSecretEnv: ["BFL_API_KEY", "FLUX_API_KEY"],
      preferredLocalSecretStore: "macOS Keychain via GET/POST/DELETE /api/bfl/key",
      serverKeyConfigured: keyStatus.configured,
      serverKeySource: keyStatus.source,
      rawKeyReadableFromApi: false,
      batchExecutionCanSpendCredits: true
    }
  });
}
