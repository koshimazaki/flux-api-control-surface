import { agentRouteMap, localAgentCoverage, nativeFluxMcp } from "@/lib/agent-routes";

export const agentWorkflowGuide = {
  name: "FLUX Control Surface Agent Guide",
  purpose:
    "Pair the hosted FLUX MCP with this local workbench API so agents can generate with BFL while keeping prompts, references, audio guides, tools, and recovered outputs visible in the dashboard.",
  nativeFluxMcp: {
    serverUrl: nativeFluxMcp.serverUrl,
    role:
      "Use the hosted FLUX MCP when the MCP client should directly generate, edit, vary, browse history, or check BFL credits through OAuth.",
    tools: nativeFluxMcp.tools.map((tool) => tool.name),
    commands: nativeFluxMcp.install
  },
  localWorkbench: {
    role:
      "Use the local dashboard routes when the agent should work with prompt libraries, saved outputs, reference roles, audio guide files, image-tool provenance, local archives, or UI-visible artifacts.",
    routes: {
      guide: agentRouteMap.mcpGuide,
      context: agentRouteMap.dashboardContext,
      manifest: agentRouteMap.mcpManifest,
      runPlan: agentRouteMap.runPlan,
      batch: agentRouteMap.batch,
      generate: agentRouteMap.generate,
      tools: agentRouteMap.tools,
      outputs: agentRouteMap.outputs,
      prompts: agentRouteMap.prompts,
      audioGuide: agentRouteMap.audioGuide,
      audioSlice: agentRouteMap.audioSlice,
      captionAgent: agentRouteMap.captionAgent
    }
  },
  useTogether: [
    "Ask the hosted FLUX MCP for quick creative exploration, variations, or BFL account history.",
    "Use this local workbench API when the result should become a durable dashboard asset, prompt-library entry, reference set, audio/video guide, or captioning job.",
    "When an agent uses /api/bfl/generate, /api/bfl/tools, or /api/dashboard/batch, the output is saved locally and can be recovered through /api/outputs."
  ],
  workflows: [
    {
      name: "Prompt combo or script",
      steps: [
        `GET ${agentRouteMap.dashboardContext}`,
        `POST ${agentRouteMap.runPlan}`,
        `POST ${agentRouteMap.batch} with execute=true when local files and gallery recovery are required`,
        `GET ${agentRouteMap.outputs}`
      ]
    },
    {
      name: "Use a gallery image as a reference",
      steps: [
        `GET ${agentRouteMap.outputs}`,
        "Use imageUrl or imageDataUrl from the selected asset in references[]",
        `POST ${agentRouteMap.runPlan} for dry-run/cost planning`,
        `POST ${agentRouteMap.generate} or ${agentRouteMap.batch}`
      ]
    },
    {
      name: "Erase, inpaint, or outpaint a saved image",
      steps: [
        `GET ${agentRouteMap.outputs}`,
        `POST ${agentRouteMap.tools} with tool=erase, inpaint, or outpaint`,
        `GET ${agentRouteMap.outputs} to recover the edited result`
      ]
    },
    {
      name: "Audio guide assets",
      steps: [
        "Use the Audio tab for browser waveform analysis, marker editing, and prompt composition",
        `POST ${agentRouteMap.audioGuide} when the agent already has an analysis + marker payload`,
        `POST ${agentRouteMap.audioSlice} to cut/loop uploaded audio for downstream video models`
      ]
    },
    {
      name: "Caption a training collection",
      steps: [
        "Build or import a collection in the Collections tab",
        `POST ${agentRouteMap.captionAgent} with collection items and dryRun=true to inspect the job`,
        "Run without dryRun when the Codex CLI should caption the collection folder"
      ]
    }
  ],
  currentGaps: [
    {
      capability: "Full browser/UI control",
      status:
        "Not exposed as a local MCP tool. Agents can call HTTP routes, but driving the live browser still needs a browser automation client."
    },
    {
      capability: "Audio analysis from a raw audio file",
      status:
        "Browser-side today. The server can render guide videos and slice audio when supplied with the analysis/marker payload."
    },
    {
      capability: "Glyph/vectorize by API",
      status:
        "Browser-local today. The Glyphs workspace can vectorize and save SVG/PNG assets, but there is no /api/glyphs/vectorize route yet."
    },
    {
      capability: "Agent file drop/import into browser storage",
      status:
        "Browser-local today. Agents can use URLs, data URLs, saved outputs, and remote archive records; arbitrary local drag/drop is not an HTTP route yet."
    },
    {
      capability: "Live UI refresh after outside agent actions",
      status:
        "Manual recovery/reload today through /api/outputs. A polling hook or server-sent event channel would make external-agent actions appear automatically."
    }
  ],
  examples: [
    "Create a two-prompt permutation plan from the cybernetic flower library, then execute it locally so outputs appear in the dashboard.",
    "Use this recovered gallery image as @character and another as @style, then generate four FLUX.2 Pro options.",
    "Outpaint this saved output to 16:9, save the result, and make it available in /api/outputs.",
    "Given audio markers, render an audio-reactive guide MP4 and attach it to the next video-model prompt record.",
    "Vectorize this image into a four-color glyph. Current path: use the browser Glyphs workspace; missing path: /api/glyphs/vectorize."
  ],
  coverage: localAgentCoverage,
  sources: [
    "https://docs.bfl.ai/api_integration/mcp_integration",
    "https://github.com/black-forest-labs/flux-mcp"
  ]
};
