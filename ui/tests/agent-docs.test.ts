import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMANDS } from "@/cli/bfl-dashboard.mjs";
import { localDashboardMcpTools } from "@/lib/agent-routes";

const guide = readFileSync(resolve(fileURLToPath(new URL("../../docs/mcp-agent-guide.md", import.meta.url))), "utf8");

describe("the written agent guide", () => {
  it("names every local MCP tool and every CLI command, so it cannot fall behind them again", () => {
    for (const tool of localDashboardMcpTools) expect(guide, `docs/mcp-agent-guide.md should mention ${tool}`).toContain(`\`${tool}\``);
    for (const command of Object.keys(COMMANDS)) expect(guide, `docs/mcp-agent-guide.md should mention ${command}`).toContain(`\`${command}\``);
  });
});
