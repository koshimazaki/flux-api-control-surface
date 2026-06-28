import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { localDashboardMcpTools, localMcpParityNotes } from "@/lib/agent-routes";
import { bflImageTools } from "@/lib/provider-registry";

// Resolve paths from this file (tests/ -> ui/) so the test is cwd-independent.
const uiRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const serverSrc = readFileSync(resolve(uiRoot, "mcp/server.mjs"), "utf8");

// Tools the stdio MCP server actually registers.
const registeredTools = Array.from(serverSrc.matchAll(/registerTool\(\s*"([^"]+)"/g)).map((match) => match[1]);
// Every /api/... path the MCP server reaches (covers both "literal" and `template` forms).
const mcpCalledRoutes = Array.from(
  new Set(Array.from(serverSrc.matchAll(/\/api\/[A-Za-z0-9/_\-[\]]+/g)).map((match) => match[0]))
);

// Every real route on disk, as "/api/<path>".
const apiDir = resolve(uiRoot, "app/api");
const allRoutes = readdirSync(apiDir, { recursive: true })
  .map((entry) => String(entry).replaceAll("\\", "/"))
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => `/api/${file.replace(/\/route\.ts$/, "")}`);

// Routes intentionally NOT wrapped as MCP tools, classified so a brand-new
// uncovered route can't slip through unnoticed.
const DISCOVERY_ONLY = ["/api/mcp/guide", "/api/mcp/status", "/api/bfl_dashboard/v1/manifest"];
const INTERNAL_ONLY = ["/api/outputs/[id]/image"];
const KNOWN_AUDIO_GAP = ["/api/audio/guide", "/api/audio/slice"];

describe("local MCP tool registry", () => {
  it("registers exactly the documented tool set (no drift between code and the manifest list)", () => {
    expect(new Set(registeredTools)).toEqual(new Set(localDashboardMcpTools));
    // No accidental duplicate registrations.
    expect(registeredTools.length).toBe(new Set(registeredTools).size);
  });

  it("only calls routes that actually exist on disk", () => {
    for (const route of mcpCalledRoutes) {
      const onDisk = resolve(uiRoot, "app", route.replace(/^\//, ""), "route.ts");
      expect(readFileSync(onDisk, "utf8").length, `${route} should resolve to a real route file`).toBeGreaterThan(0);
    }
  });
});

describe("MCP covers every core control-surface function", () => {
  it("wraps generation, image tools, planning, prompts, glyphs, credits, references, and assets", () => {
    const mustBeReachable = [
      "/api/bfl/generate",
      "/api/bfl/tools",
      "/api/dashboard/batch",
      "/api/dashboard/run-plan",
      "/api/dashboard/context",
      "/api/prompts",
      "/api/glyphs/vectorize",
      "/api/bfl/credits",
      "/api/bfl/key",
      "/api/reference-archive",
      "/api/outputs",
      "/api/finetune/dataset",
      "/api/finetunes"
    ];
    for (const route of mustBeReachable) {
      expect(mcpCalledRoutes, `${route} must be reachable from the MCP server`).toContain(route);
    }
  });

  it("wraps the FLUX.2 [klein] finetune loop (dataset export, registry, finetuned generation)", () => {
    // The four finetune tools are registered (and therefore in localDashboardMcpTools).
    for (const tool of ["build_finetune_dataset", "register_finetune", "list_finetunes", "generate_with_finetune"]) {
      expect(registeredTools, `${tool} must be registered`).toContain(tool);
    }
    // Their routes are reachable and exist on disk (asserted by the "exists on disk" test).
    expect(mcpCalledRoutes).toContain("/api/finetune/dataset");
    expect(mcpCalledRoutes).toContain("/api/finetunes");
    // Finetuned generation reuses the standard generate route with a finetune_id.
    expect(serverSrc).toMatch(/finetuneId/);
    const generateRouteSrc = readFileSync(resolve(uiRoot, "app/api/bfl/generate/route.ts"), "utf8");
    expect(generateRouteSrc).toMatch(/finetune_id/);
  });

  it("drives Virtual Try-On end-to-end through the local MCP (no BFL-hosted MCP needed)", () => {
    // 1. A single tool wraps all four FLUX image tools, including VTO.
    expect(registeredTools).toContain("run_image_tool");
    expect(serverSrc).toMatch(/virtual try-on/i);
    expect(mcpCalledRoutes).toContain("/api/bfl/tools");
    // 2. VTO is a registered FLUX tool with the documented endpoint.
    const vto = bflImageTools.find((tool) => tool.value === "vto");
    expect(vto?.endpoint).toBe("flux-tools/vto-v1");
    // 3. The route actually branches on vto and forwards a garment payload.
    const toolsRouteSrc = readFileSync(resolve(uiRoot, "app/api/bfl/tools/route.ts"), "utf8");
    expect(toolsRouteSrc).toMatch(/tool === "vto"/);
    expect(toolsRouteSrc).toMatch(/garment/);
  });
});

describe("MCP coverage gaps stay explicit", () => {
  it("leaves only the audio routes unwrapped, and any NEW route must declare its coverage", () => {
    const uncovered = allRoutes.filter(
      (route) =>
        !mcpCalledRoutes.includes(route) &&
        !DISCOVERY_ONLY.includes(route) &&
        !INTERNAL_ONLY.includes(route)
    );
    // If this fails because a new route appeared, either add an MCP tool for it
    // or classify it (discovery/internal/known-gap) — that is the whole point.
    expect(uncovered.sort()).toEqual([...KNOWN_AUDIO_GAP].sort());
  });

  it("documents the audio/binary HTTP-only gap honestly in the parity notes", () => {
    expect(localMcpParityNotes.httpOnly.toLowerCase()).toContain("audio");
  });
});
