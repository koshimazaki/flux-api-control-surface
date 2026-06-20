import { describe, expect, it } from "vitest";
import { agentWorkflowGuide } from "@/lib/agent-guide";
import { agentRouteMap } from "@/lib/agent-routes";

describe("agentWorkflowGuide", () => {
  it("pairs hosted FLUX MCP with local workbench routes", () => {
    expect(agentWorkflowGuide.nativeFluxMcp.serverUrl).toBe("https://mcp.bfl.ai");
    expect(agentWorkflowGuide.nativeFluxMcp.tools).toContain("generate_image");
    expect(agentWorkflowGuide.localWorkbench.routes.guide).toBe(agentRouteMap.mcpGuide);
    expect(agentWorkflowGuide.localWorkbench.routes.tools).toBe(agentRouteMap.tools);
    expect(agentWorkflowGuide.localWorkbench.routes.glyphVectorize).toBe(agentRouteMap.glyphVectorize);
    expect(agentWorkflowGuide.localWorkbench.mcpWrapper.tools).toContain("run_batch");
    expect(agentWorkflowGuide.localWorkbench.mcpWrapper.tools).toContain("save_prompt");
    expect(agentWorkflowGuide.localWorkbench.mcpWrapper.httpOnly).toContain("binary media");
  });

  it("names the main missing capabilities for future MCP parity", () => {
    const gaps = agentWorkflowGuide.currentGaps.map((gap) => gap.capability.toLowerCase()).join(" ");

    expect(gaps).toContain("audio analysis");
    expect(gaps).toContain("binary audio export");
    expect(gaps).toContain("live push updates");
    expect(agentWorkflowGuide.examples.join(" ")).toContain("SVG glyphs");
  });
});
