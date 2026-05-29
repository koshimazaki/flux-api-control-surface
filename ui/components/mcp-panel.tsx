"use client";

import { useEffect, useMemo, useState } from "react";
import { Clipboard, ExternalLink, PlugZap, RefreshCcw } from "lucide-react";
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
      dashboard: "BFL API Dashboard",
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
        note: "Use /api/dashboard/run-plan to get the same request bodies the dashboard batch executor uses."
      },
      prompt: props.prompt,
      recent_runs: props.runLog.slice(0, 5)
    }),
    [props, status?.serverUrl]
  );

  const copy = (value: string) => void copyText(value);

  return (
    <section className="assetsPanel mcpPanel">
      <div className="panelHeader">
        <div>
          <h2>MCP Bridge</h2>
          <p>API dashboard trace handoff for FLUX MCP clients</p>
        </div>
        <button onClick={() => loadStatus()}>
          <RefreshCcw size={16} />
          Refresh
        </button>
      </div>

      <div className="mcpGrid">
        <div className="mcpCard">
          <PlugZap size={18} />
          <span>Dashboard API</span>
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
          <code>GET /api/dashboard/context</code>
          <button onClick={() => copy(`${window.location.origin}/api/dashboard/context`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Route manifest</label>
          <code>GET /api/mcp/manifest</code>
          <button onClick={() => copy(`${window.location.origin}/api/mcp/manifest`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Batch run plan</label>
          <code>POST /api/dashboard/run-plan</code>
          <button onClick={() => copy(`${window.location.origin}/api/dashboard/run-plan`)}>
            <Clipboard size={15} />
            Copy
          </button>
        </div>
        <div>
          <label>Batch executor</label>
          <code>POST /api/dashboard/batch</code>
          <button onClick={() => copy(`${window.location.origin}/api/dashboard/batch`)}>
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
