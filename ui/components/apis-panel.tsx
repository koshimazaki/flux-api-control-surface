import { Bot, KeyRound, PlugZap, Route } from "lucide-react";
import { PanelHeader } from "@/components/ui/panel-header";

type ApisPanelProps = {
  captionJobPath?: string;
};

export function ApisPanel({ captionJobPath }: ApisPanelProps) {
  return (
    <section className="assetsPanel apisPanel">
      <PanelHeader title="APIs" subtitle="Local routes and agent handoff points" />

      <div className="mcpGrid">
        <div className="mcpCard">
          <KeyRound size={18} />
          <span>BFL API</span>
          <strong>Header or env</strong>
          <small>BFL_API_KEY / FLUX_API_KEY</small>
        </div>
        <div className="mcpCard">
          <Bot size={18} />
          <span>Caption Agent</span>
          <strong>Codex vision</strong>
          <small>{captionJobPath || "No caption job spawned yet"}</small>
        </div>
        <div className="mcpCard">
          <PlugZap size={18} />
          <span>Namespace</span>
          <strong>bfl_dashboard/v1</strong>
          <small>underscore routes for agent-facing API</small>
        </div>
      </div>

      <div className="commandGrid">
        <div>
          <label>Manifest</label>
          <code>GET /api/bfl_dashboard/v1/manifest</code>
        </div>
        <div>
          <label>Caption agent</label>
          <code>POST /api/bfl_dashboard/v1/caption_agent</code>
        </div>
        <div>
          <label>Current bridge</label>
          <code>GET /api/mcp/manifest</code>
        </div>
        <div>
          <label>BFL credits</label>
          <code>POST /api/bfl/credits</code>
        </div>
      </div>

      <div className="traceBlock">
        <div className="runLogHeader">
          <span>Route shape</span>
          <Route size={15} />
        </div>
        <pre>{JSON.stringify({
          namespace: "/api/bfl_dashboard/v1",
          stableContract: true,
          captioning: "UI prepares collection; backend spawns Codex with image attachments and captioning brief.",
          futureProviders: ["Codex/GPT vision", "Gemini", "local vision model"]
        }, null, 2)}</pre>
      </div>
    </section>
  );
}
