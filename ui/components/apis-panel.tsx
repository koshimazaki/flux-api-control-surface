import { Bot, KeyRound, PlugZap, Route } from "lucide-react";
import { PanelHeader } from "@/components/ui/panel-header";
import { agentRouteMap, localAgentCoverage } from "@/lib/agent-routes";

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
          <span>FLUX API</span>
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
          <code>GET {agentRouteMap.apiManifest}</code>
        </div>
        <div>
          <label>Caption agent</label>
          <code>POST {agentRouteMap.captionAgent}</code>
        </div>
        <div>
          <label>Current bridge</label>
          <code>GET {agentRouteMap.mcpManifest}</code>
        </div>
        <div>
          <label>FLUX credits</label>
          <code>POST {agentRouteMap.credits}</code>
        </div>
        <div>
          <label>Image tools</label>
          <code>POST {agentRouteMap.tools}</code>
        </div>
        <div>
          <label>Run plan</label>
          <code>POST {agentRouteMap.runPlan}</code>
        </div>
        <div>
          <label>Audio guide</label>
          <code>POST {agentRouteMap.audioGuide}</code>
        </div>
        <div>
          <label>Audio slice</label>
          <code>POST {agentRouteMap.audioSlice}</code>
        </div>
        <div>
          <label>Outputs</label>
          <code>GET {agentRouteMap.outputs}</code>
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
          generation: [agentRouteMap.runPlan, agentRouteMap.batch, agentRouteMap.generate],
          tools: [agentRouteMap.tools],
          audio: [agentRouteMap.audioGuide, agentRouteMap.audioSlice],
          assets: [agentRouteMap.outputs, agentRouteMap.referenceArchive],
          coverage: localAgentCoverage,
          futureProviders: ["Codex/GPT vision", "Gemini", "local vision model"]
        }, null, 2)}</pre>
      </div>
    </section>
  );
}
