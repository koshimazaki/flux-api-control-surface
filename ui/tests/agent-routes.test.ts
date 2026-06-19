import { describe, expect, it } from "vitest";
import { agentRouteMap, dashboardAgentRoutes, localAgentCoverage, mcpStatusRoutes } from "@/lib/agent-routes";

describe("agent route catalog", () => {
  it("publishes the local routes agents need for generation, tools, audio, and assets", () => {
    const paths = new Set(dashboardAgentRoutes.map((route) => `${route.method} ${route.path}`));

    expect(paths).toContain(`GET ${agentRouteMap.mcpGuide}`);
    expect(paths).toContain(`GET ${agentRouteMap.apiKey}`);
    expect(paths).toContain(`POST ${agentRouteMap.runPlan}`);
    expect(paths).toContain(`POST ${agentRouteMap.batch}`);
    expect(paths).toContain(`POST ${agentRouteMap.generate}`);
    expect(paths).toContain(`POST ${agentRouteMap.tools}`);
    expect(paths).toContain(`POST ${agentRouteMap.glyphVectorize}`);
    expect(paths).toContain(`POST ${agentRouteMap.audioGuide}`);
    expect(paths).toContain(`POST ${agentRouteMap.audioSlice}`);
    expect(paths).toContain(`GET ${agentRouteMap.outputs}`);
    expect(paths).toContain(`GET ${agentRouteMap.referenceArchive}`);
    expect(paths).toContain(`GET ${agentRouteMap.prompts}`);
    expect(paths).toContain(`POST ${agentRouteMap.captionAgent}`);
  });

  it("keeps status discovery free of destructive routes", () => {
    expect(mcpStatusRoutes).toContain(agentRouteMap.apiKey);
    expect(mcpStatusRoutes).toContain(agentRouteMap.tools);
    expect(mcpStatusRoutes).toContain(agentRouteMap.glyphVectorize);
    expect(mcpStatusRoutes).toContain(agentRouteMap.audioGuide);
    expect(mcpStatusRoutes).not.toContain(`${agentRouteMap.prompts} DELETE`);
  });

  it("documents browser-local gaps instead of implying every workflow is server-routable", () => {
    expect(localAgentCoverage.imageTools).toMatch(/erase, inpaint, and outpaint/i);
    expect(localAgentCoverage.glyphs).toMatch(/server-side SVG\/PNG glyph vectorization/i);
    expect(localAgentCoverage.audio).toMatch(/audio slicing and guide rendering/i);
    expect(localAgentCoverage.uiSync).toMatch(/polls for new server outputs/i);
    expect(localAgentCoverage.localOnly).toMatch(/Browser-imported files/i);
  });
});
