import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS, HELP, buildRequests, parseArgs } from "@/cli/bfl-dashboard.mjs";

const uiRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const serverSrc = readFileSync(resolve(uiRoot, "mcp/server.mjs"), "utf8");

const METHOD_BY_HELPER: Record<string, string> = { requestJson: "GET", post: "POST", patch: "PATCH", del: "DELETE" };

/** Each MCP tool with the route and method its handler calls, read from the server source. */
const mcpTools = serverSrc
  .split("server.registerTool(")
  .slice(1)
  .map((block) => {
    const name = block.match(/^\s*"([^"]+)"/)?.[1] ?? "";
    const call = block.match(/\b(requestJson|post|patch|del)\(\s*(?:withParams\(\s*)?["`](\/api\/[A-Za-z0-9/_-]+)/);
    return { name, method: call ? METHOD_BY_HELPER[call[1]] : "", path: call?.[2] ?? "" };
  });

const commands = Object.entries(COMMANDS as Record<string, { tool: string; method: string; path: string; usage: string }>);

describe("the CLI and the local MCP server are two doors to the same routes", () => {
  it("reads a route and method for every MCP tool", () => {
    expect(mcpTools.length).toBeGreaterThan(30);
    for (const tool of mcpTools) expect(tool, `${tool.name} should call a local route`).toMatchObject({ method: expect.stringMatching(/GET|POST|PATCH|DELETE/), path: expect.stringMatching(/^\/api\//) });
  });

  it("has a command for every MCP tool, on the same route with the same method", () => {
    for (const tool of mcpTools) {
      const match = commands.find(([, command]) => command.tool === tool.name);
      expect(match, `MCP tool ${tool.name} has no CLI command`).toBeDefined();
      const [name, command] = match!;
      expect({ name, method: command.method, path: command.path }).toEqual({ name, method: tool.method, path: tool.path });
    }
  });

  it("has no command for a tool the MCP server does not register, and no tool claimed twice", () => {
    const registered = new Set(mcpTools.map((tool) => tool.name));
    const claimed = commands.map(([, command]) => command.tool);
    for (const tool of claimed) expect(registered, `${tool} is not an MCP tool`).toContain(tool);
    expect(claimed.length).toBe(new Set(claimed).size);
  });

  it("lists every command in its help", () => {
    for (const [, command] of commands) expect(HELP).toContain(command.usage.split("\n")[0]);
  });
});

describe("CLI requests", () => {
  const request = (line: string, payload?: Record<string, unknown>) => {
    const { command, flags, positionals } = parseArgs(line.split(" "));
    return buildRequests(command, { flags, positionals, payload });
  };

  it("sends FLUX 3 Image payloads to the FLUX 3 Image route as given", () => {
    const payload = { mode: "t2i", prompt: "a glass fox", settings: { resolution: "2k" } };
    expect(request("generate-flux3-image --json request.json", payload)).toEqual([{ method: "POST", path: "/api/bfl/flux3-image", body: payload }]);
  });

  it("turns flags into query strings for lists", () => {
    expect(request("assets --limit 5 --include-data")[0].path).toBe("/api/outputs?limit=5&includeData=true");
    expect(request("evaluations --media video --format jsonl")[0].path).toBe("/api/evaluations?mediaType=video&format=jsonl");
    expect(request("queue job-1")[0]).toEqual({ method: "GET", path: "/api/dashboard/queue?id=job-1", body: undefined });
    expect(request("reference-archive --set-id flowers")[0].path).toBe("/api/reference-archive?setId=flowers");
  });

  it("drives the queue: enqueue, update and cancel", () => {
    const jobs = { jobs: [{ kind: "image", operation: "flux3-image", payload: { mode: "t2i", prompt: "a fox" } }] };
    expect(request("enqueue --json jobs.json", jobs)[0]).toEqual({ method: "POST", path: "/api/dashboard/queue", body: jobs });
    expect(request("queue-update priority job-1 --priority 5")[0]).toEqual({
      method: "PATCH",
      path: "/api/dashboard/queue",
      body: { action: "priority", id: "job-1", priority: 5 }
    });
    expect(request("queue-update settings --global-limit 6 --video-limit 1")[0].body).toEqual({
      action: "settings",
      globalLimit: 6,
      laneLimits: { video: 1 }
    });
    expect(request("queue-cancel job-1 --remove")[0]).toMatchObject({ method: "DELETE", path: "/api/dashboard/queue?id=job-1&remove=true" });
    expect(request("queue-cancel --settled")[0].path).toBe("/api/dashboard/queue?settled=true");
    expect(() => request("queue-cancel")).toThrow(/job ID, or --settled/);
  });

  it("wraps a bare record for the routes that take { record }", () => {
    const record = { id: "fox", prompt: "a glass fox" };
    expect(request("save-prompt --json record.json", record)[0].body).toEqual({ record });
    expect(request("save-prompt --json record.json", { record })[0].body).toEqual({ record });
    expect(request("register-finetune --json record.json", { finetuneId: "ft-1" })[0].body).toEqual({ record: { finetuneId: "ft-1" } });
  });

  it("names the record it acts on", () => {
    expect(request("delete-prompt fox")[0]).toMatchObject({ method: "DELETE", path: "/api/prompts?id=fox" });
    expect(request("evaluate gen-1 --rating 5 --verdict keep --tags a,b")[0]).toEqual({
      method: "PATCH",
      path: "/api/evaluations?id=gen-1",
      body: { rating: 5, verdict: "keep", tags: ["a", "b"] }
    });
    expect(request("update-collection col-1 --json changes.json", { name: "Foxes" })[0]).toEqual({
      method: "PATCH",
      path: "/api/collections?id=col-1",
      body: { name: "Foxes" }
    });
    expect(request("delete-collection col-1 --asset-id fox")[0].path).toBe("/api/collections?id=col-1&assetId=fox");
    expect(() => request("delete-prompt")).toThrow(/prompt ID is required/);
  });

  it("checks credits with an empty body, and vectorizes a batch one request per source and colour count", () => {
    expect(request("credits")[0]).toEqual({ method: "POST", path: "/api/bfl/credits", body: {} });
    const batch = request("vectorize-glyph-batch --json request.json", { sourceAssetIds: ["a", "b"], colors: [2, 4], minArea: 8 });
    expect(batch).toHaveLength(4);
    expect(batch[1]).toEqual({
      method: "POST",
      path: "/api/glyphs/vectorize",
      body: { minArea: 8, sourceAssetId: "a", colors: 4, title: "glyph-4c-a" }
    });
  });
});
