"use client";

import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, PlugZap, RefreshCcw } from "lucide-react";
import { PanelHeader } from "@/components/ui/panel-header";
import { agentRouteMap, localAgentCoverage } from "@/lib/agent-routes";
import { copyText } from "@/lib/clipboard";
import type { BatchMode, BalanceState, RunLogEntry } from "@/lib/types";

type McpStatus = {
  status: string;
  serverUrl: string;
  commands: {
    add: string;
    login: string;
    list: string;
  };
  apiRoutes: string[];
  coverage?: typeof localAgentCoverage;
  directBrowserClient: boolean;
};

type McpPanelProps = {
  model: string;
  width: number;
  height: number;
  batchCount: number;
  batchMode: BatchMode;
  selectedPromptIds: string[];
  runPlanPayload: Record<string, unknown>;
  prompt: string;
  promptTokens: number;
  referencesCount: number;
  balance: BalanceState;
  runLog: RunLogEntry[];
};

export function McpPanel(props: McpPanelProps) {
  const [status, setStatus] = useState<McpStatus | null>(null);

  async function loadStatus() {
    const response = await fetch("/api/mcp/status", { cache: "no-store" });
    setStatus(await response.json());
  }

  useEffect(() => {
    loadStatus().catch(() => undefined);
  }, []);

  const tracePayload = useMemo(
    () => ({
      dashboard: "FLUX API Control Surface",
      api: {
        model: props.model,
        width: props.width,
        height: props.height,
        prompt_tokens_estimate: props.promptTokens,
        references: props.referencesCount,
        batch_count: props.batchCount,
        batch_mode: props.batchMode,
        selected_prompt_ids: props.selectedPromptIds,
        output_format: "png"
      },
      run_plan_payload: props.runPlanPayload,
      mcp_hint: {
        tool: "generate_image",
        server: status?.serverUrl || "https://mcp.bfl.ai",
        note:
          "Use /api/dashboard/run-plan for generation bodies, /api/bfl/tools for erase/inpaint/outpaint, and /api/audio/* for audio guide assets."
      },
      coverage: status?.coverage || localAgentCoverage,
      prompt: props.prompt,
      recent_runs: props.runLog.slice(0, 5)
    }),
    [props, status?.coverage, status?.serverUrl]
  );

  const copy = (value: string) => void copyText(value);

  return (
    <section className="assetsPanel mcpPanel">
      <PanelHeader title="MCP Bridge" subtitle="Control-surface trace handoff for FLUX MCP clients">
        <button onClick={() => loadStatus()}>
          <RefreshCcw size={16} />
          Refresh
        </button>
      </PanelHeader>

      <div className="mcpGrid">
        <div className="mcpCard">
          <PlugZap size={18} />
          <span>Control Surface API</span>
          <strong>{status?.status || "checking"}</strong>
          <small>{status?.apiRoutes?.join(" | ") || "/api/bfl/generate"}</small>
        </div>
        <div className="mcpCard">
          <ExternalLink size={18} />
          <span>FLUX MCP</span>
          <strong>{status?.serverUrl || "https://mcp.bfl.ai"}</strong>
          <small>{status?.directBrowserClient ? "browser client" : "external MCP client"}</small>
        </div>
        <div className="mcpCard">
          <PlugZap size={18} />
          <span>Balance</span>
          <strong>{typeof props.balance.credits === "number" ? `${props.balance.credits.toFixed(2)} cr` : "unchecked"}</strong>
          <small>{props.runLog.length} logged calls</small>
        </div>
      </div>

      <div className="commandGrid">
        <div>
          <label>Codex add</label>
          <code>{status?.commands.add || "codex mcp add FLUX --url https://mcp.bfl.ai"}</code>
          <button onClick={() => copy(status?.commands.add || "codex mcp add FLUX --url https://mcp.bfl.ai")}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Codex login</label>
          <code>{status?.commands.login || "codex mcp login FLUX"}</code>
          <button onClick={() => copy(status?.commands.login || "codex mcp login FLUX")}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Dashboard context</label>
          <code>GET {agentRouteMap.dashboardContext}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.dashboardContext}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Route manifest</label>
          <code>GET {agentRouteMap.mcpManifest}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.mcpManifest}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Batch run plan</label>
          <code>POST {agentRouteMap.runPlan}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.runPlan}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Batch executor</label>
          <code>POST {agentRouteMap.batch}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.batch}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Image tools</label>
          <code>POST {agentRouteMap.tools}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.tools}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Audio guide</label>
          <code>POST {agentRouteMap.audioGuide}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.audioGuide}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Recover outputs</label>
          <code>GET {agentRouteMap.outputs}</code>
          <button onClick={() => copy(`${window.location.origin}${agentRouteMap.outputs}`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
      </div>

      <div className="traceBlock">
        <div className="runLogHeader">
          <span>Trace payload</span>
          <button onClick={() => copy(JSON.stringify(tracePayload, null, 2))}>
            <Clipboard size={15} />
            Copy JSON
          </button>
        </div>
        <pre>{JSON.stringify(tracePayload, null, 2)}</pre>
      </div>
    </section>
  );
}
