#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_BASE_URL = "http://localhost:3000";
const baseUrl = (process.env.BFL_DASHBOARD_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

function result(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed with ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

function compactAsset(asset) {
  return {
    id: asset.id,
    title: asset.title,
    model: asset.model,
    provider: asset.provider,
    operation: asset.operation,
    assetKind: asset.assetKind,
    sourceAssetId: asset.sourceAssetId,
    imageUrl: asset.imageUrl || asset.sampleUrl || asset.image_url,
    localImagePath: asset.localImagePath,
    localMetadataPath: asset.localMetadataPath,
    prompt: String(asset.prompt || "").slice(0, 240)
  };
}

function post(path, body) {
  return requestJson(path, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

const selectionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
  .optional();

const server = new McpServer({
  name: "bfl-dashboard",
  version: "0.1.0"
});

server.registerTool(
  "get_manifest",
  {
    title: "Get Dashboard Manifest",
    description: "Return the local dashboard MCP/agent route manifest.",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/mcp/manifest"))
);

server.registerTool(
  "get_dashboard_context",
  {
    title: "Get Dashboard Context",
    description: "Return local models, prompt records, outputs, auth expectations, and route map.",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/dashboard/context"))
);

server.registerTool(
  "list_assets",
  {
    title: "List Assets",
    description: "List recoverable dashboard outputs and local asset records.",
    inputSchema: {
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
      includeData: z.boolean().optional()
    }
  },
  async ({ limit = 40, offset = 0, includeData = false }) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      includeData: includeData ? "true" : "false"
    });
    const assets = await requestJson(`/api/outputs?${params.toString()}`);
    return result({ count: assets.length, assets: assets.map(compactAsset) });
  }
);

server.registerTool(
  "list_prompts",
  {
    title: "List Prompts",
    description: "List bundled public prompt-library records.",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/prompts"))
);

server.registerTool(
  "build_run_plan",
  {
    title: "Build Run Plan",
    description: "Build generation request bodies without spending credits.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    }
  },
  async ({ payload }) => result(await post("/api/dashboard/run-plan", payload))
);

server.registerTool(
  "generate_saved_image",
  {
    title: "Generate Saved Image",
    description: "Call the local BFL generation route once and save the result into the dashboard output gallery.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload }) => result(await post("/api/bfl/generate", payload))
);

server.registerTool(
  "run_image_tool",
  {
    title: "Run Image Tool",
    description: "Run erase, inpaint, or outpaint through the local dashboard route and save the result.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload }) => result(await post("/api/bfl/tools", payload))
);

server.registerTool(
  "vectorize_glyph",
  {
    title: "Vectorize Glyph",
    description: "Vectorize one saved output or image URL/data URL into an SVG plus PNG preview and save it to the gallery.",
    inputSchema: {
      sourceAssetId: z.string().optional(),
      sourceTitle: z.string().optional(),
      image: z.string().optional(),
      title: z.string().optional(),
      colors: z.number().int().min(2).max(32).optional(),
      minArea: z.number().int().min(0).max(80).optional(),
      knockoutBackground: z.boolean().optional(),
      targetMode: z.enum(["square", "native"]).optional(),
      maxTraceSize: z.number().int().min(128).max(1536).optional(),
      selection: selectionSchema,
      includeSvg: z.boolean().optional()
    }
  },
  async ({ includeSvg = false, ...payload }) => {
    const data = await post("/api/glyphs/vectorize", payload);
    return result({
      id: data.id,
      title: data.runSettings?.title || data.outputFiles?.fileBaseName,
      sourceAssetId: data.sourceAssetId,
      colors: data.payload?.colors,
      outputFiles: data.outputFiles,
      svgLength: typeof data.svg === "string" ? data.svg.length : 0,
      svg: includeSvg ? data.svg : undefined
    });
  }
);

server.registerTool(
  "vectorize_glyph_batch",
  {
    title: "Vectorize Glyph Batch",
    description: "Vectorize multiple saved outputs into multiple color-count glyph assets.",
    inputSchema: {
      sourceAssetIds: z.array(z.string()).min(1).max(20),
      colors: z.array(z.number().int().min(2).max(32)).min(1).max(8).optional(),
      minArea: z.number().int().min(0).max(80).optional(),
      knockoutBackground: z.boolean().optional(),
      targetMode: z.enum(["square", "native"]).optional(),
      maxTraceSize: z.number().int().min(128).max(1536).optional(),
      selection: selectionSchema
    }
  },
  async ({ sourceAssetIds, colors = [2, 4], ...shared }) => {
    const outputs = [];
    for (const sourceAssetId of sourceAssetIds) {
      for (const colorCount of colors) {
        const data = await post("/api/glyphs/vectorize", {
          ...shared,
          sourceAssetId,
          colors: colorCount,
          title: `glyph-${colorCount}c-${sourceAssetId.slice(0, 12)}`
        });
        outputs.push({
          id: data.id,
          sourceAssetId,
          colors: colorCount,
          outputFiles: data.outputFiles,
          svgLength: typeof data.svg === "string" ? data.svg.length : 0
        });
      }
    }
    return result({ count: outputs.length, outputs });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`BFL Dashboard MCP connected to ${baseUrl}`);
