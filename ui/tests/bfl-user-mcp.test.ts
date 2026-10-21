import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, it } from "vitest";

it("MCP preserves optional user and rejects invalid values before calling the dashboard", async () => {
  // A child-process fetch stub echoes the dashboard request. No sockets, jobs or BFL calls.
  const preload = `globalThis.fetch = async (url, options) => new Response(JSON.stringify({
    path: new URL(url).pathname, body: JSON.parse(options.body)
  }), { headers: { "content-type": "application/json" } });`;
  const client = new Client({ name: "bfl-user-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, fileURLToPath(new URL("../mcp/server.mjs", import.meta.url))],
    env: { BFL_DASHBOARD_URL: "http://127.0.0.1:1" }
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    for (const name of ["edit_video", "upscale_video"]) {
      expect(listed.tools.find((tool) => tool.name === name)?.inputSchema.properties).toHaveProperty("user");
    }
    const calls = [
      { name: "edit_video", path: "/api/bfl/video-edit", body: { inputVideo: "video", prompt: "fox" }, wrap: false },
      { name: "upscale_video", path: "/api/bfl/video-upscale", body: { inputVideo: "video" }, wrap: false },
      ...["erase", "vto", "outpaint", "deblur"].map((tool) => ({
        name: "run_image_tool", path: "/api/bfl/tools", wrap: true,
        body: {
          tool, image: "source",
          ...(tool === "erase" ? { mask: "mask" } : {}),
          ...(tool === "vto" ? { garment: "garment", prompt: "fox" } : {}),
          ...(tool === "outpaint" ? { canvasWidth: 1024, canvasHeight: 1024 } : {})
        }
      }))
    ];
    for (const call of calls) {
      for (const user of [undefined, null, "  opaque ID  ", "😀".repeat(256)]) {
        const body = { ...call.body, ...(user === undefined ? {} : { user }) };
        const result = await client.callTool({ name: call.name, arguments: call.wrap ? { payload: body } : body });
        expect(result.isError).not.toBe(true);
        const content = result.content as Array<{ type: string; text: string }>;
        expect(JSON.parse(content[0].text)).toEqual({ path: call.path, body });
      }
      for (const user of ["", "a".repeat(257), "😀".repeat(257), "before\0after", 1, false, [], {}]) {
        const body = { ...call.body, user };
        const result = await client.callTool({ name: call.name, arguments: call.wrap ? { payload: body } : body });
        expect(result.isError).toBe(true);
      }
    }
  } finally {
    await client.close();
  }
}, 20_000);
