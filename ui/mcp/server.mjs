#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 127.0.0.1, not localhost: `npm run dev`/`start` bind Next with `-H 127.0.0.1`
// (IPv4 only), so a `localhost` default would fail to connect on hosts where it
// resolves to ::1 first. Override with BFL_DASHBOARD_URL for non-default setups.
const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
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
    mediaType: asset.mediaType || "image",
    videoUrl: asset.videoUrl,
    localVideoPath: asset.localVideoPath,
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

function patch(path, body) {
  return requestJson(path, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

function del(path) {
  return requestJson(path, {
    method: "DELETE"
  });
}

function withParams(path, params) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

const selectionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
  .optional();

const imageInputSchema = z.string().min(1);
const seedSchema = z.number().nullable().optional();
const toolBaseSchema = z.object({
  apiKey: z.string().optional(),
  image: imageInputSchema.describe("Source image URL, data URL, or raw base64."),
  seed: seedSchema,
  title: z.string().optional(),
  sourceAssetId: z.string().optional()
});
const imageToolPayloadSchema = z.discriminatedUnion("tool", [
  toolBaseSchema.extend({
    tool: z.literal("erase"),
    mask: imageInputSchema.describe("Mask URL, data URL, or raw base64. White pixels are edited."),
    dilatePixels: z.number().int().min(0).max(25).optional(),
    outputFormat: z.enum(["png", "jpeg"]).optional()
  }),
  toolBaseSchema.extend({
    tool: z.literal("vto"),
    garment: imageInputSchema.optional(),
    garments: z.array(imageInputSchema).min(1).max(4).optional(),
    prompt: z.string().min(1),
    safetyTolerance: z.number().int().min(0).max(5).optional(),
    outputFormat: z.enum(["png", "jpeg", "webp"]).optional()
  }),
  toolBaseSchema.extend({
    tool: z.literal("outpaint"),
    canvasWidth: z.number().int().min(64),
    canvasHeight: z.number().int().min(64),
    offsetX: z.number().nullable().optional(),
    offsetY: z.number().nullable().optional(),
    mode: z.enum(["high", "fast"]).optional(),
    autoCrop: z.boolean().optional(),
    prompt: z.string().optional(),
    outputFormat: z.enum(["png", "jpeg"]).optional()
  }),
  toolBaseSchema.extend({
    tool: z.literal("deblur"),
    safetyTolerance: z.number().int().min(0).max(5).optional(),
    outputFormat: z.enum(["png", "jpeg", "webp"]).optional()
  })
]);

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
  "get_api_key_status",
  {
    title: "Get API Key Status",
    description: "Report whether the dashboard can resolve a FLUX API key from env or macOS Keychain. The raw key is never returned.",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/bfl/key"))
);

server.registerTool(
  "check_credits",
  {
    title: "Check Credits",
    description: "Check FLUX API credits through the local dashboard server. The raw key is never returned.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown()).optional()
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload = {} }) => result(await post("/api/bfl/credits", payload))
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
  "run_batch",
  {
    title: "Run Batch",
    description: "Dry-run or execute a dashboard batch through /api/dashboard/batch. Use execute=false for planning only.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload }) => result(await post("/api/dashboard/batch", payload))
);

server.registerTool(
  "plan_video_script",
  {
    title: "Plan Video Script Batch",
    description:
      "Deterministically plan a FLUX 3 Video Script batch without spending anything: pools from asset ids or a saved Collection, sequence/per-slot generator workflows (combination, arrangement, rotation, cartesian, zip, seeded sample), prompt assignment from inline texts or promptIds, even or timed keyframes, dedupe, hard cap, and per-second cost. Returns the preview chain, per-row validation, and queue-ready jobs — submit them with enqueue_generation_jobs when the cost is accepted.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async ({ payload }) => result(await post("/api/dashboard/video-script-plan", payload))
);

server.registerTool(
  "list_generation_queue",
  {
    title: "List Generation Queue",
    description:
      "List the server-owned generation queue: jobs, lifecycle summary, lane limits, pause state, quarantined sources, and runner lease status. Work runs without an open dashboard tab.",
    inputSchema: {
      id: z.string().optional().describe("Return one queue job instead of the whole queue.")
    }
  },
  async ({ id }) => result(await requestJson(withParams("/api/dashboard/queue", { id })))
);

server.registerTool(
  "enqueue_generation_jobs",
  {
    title: "Enqueue Generation Jobs",
    description:
      "Enqueue one or more image, tool, or FLUX 3 video jobs onto the server-owned queue. Returns queue job ids immediately; the server keeps executing them with no browser open.",
    inputSchema: {
      jobs: z
        .array(
          z.object({
            kind: z.enum(["image", "tool", "video"]),
            operation: z.string().optional(),
            title: z.string().optional(),
            payload: z.record(z.string(), z.unknown()),
            priority: z.number().optional(),
            dependsOn: z.array(z.string()).max(20).optional(),
            batchId: z.string().optional()
          })
        )
        .min(1)
        .max(100)
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ jobs }) => result(await post("/api/dashboard/queue", { jobs }))
);

server.registerTool(
  "update_generation_job",
  {
    title: "Update Generation Queue",
    description:
      "Pause, resume, retry, cancel, reorder by priority, change concurrency settings, or clear settled jobs on the server-owned queue.",
    inputSchema: {
      action: z.enum(["pause", "resume", "retry", "cancel", "priority", "settings", "clear-settled"]),
      id: z.string().optional().describe("Queue job id for retry, cancel, and priority."),
      priority: z.number().optional().describe("Higher runs sooner."),
      reason: z.string().optional(),
      globalLimit: z.number().int().min(1).max(24).optional(),
      laneLimits: z
        .object({
          image: z.number().int().min(1).max(24).optional(),
          tool: z.number().int().min(1).max(24).optional(),
          video: z.number().int().min(1).max(24).optional()
        })
        .optional()
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async (payload) => result(await patch("/api/dashboard/queue", payload))
);

server.registerTool(
  "cancel_generation_job",
  {
    title: "Cancel Generation Job",
    description:
      "Cancel a queued or running generation job, remove a settled one, or clear every settled job from the queue.",
    inputSchema: {
      id: z.string().optional(),
      remove: z.boolean().optional().describe("Remove the job record instead of leaving it cancelled."),
      settled: z.boolean().optional().describe("Clear all complete, failed, and cancelled jobs.")
    },
    annotations: {
      destructiveHint: true,
      openWorldHint: false
    }
  },
  async ({ id, remove, settled }) =>
    result(
      await del(
        withParams("/api/dashboard/queue", {
          id,
          remove: remove ? "true" : undefined,
          settled: settled ? "true" : undefined
        })
      )
    )
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
  "list_flux3_videos",
  {
    title: "List FLUX 3 Videos",
    description: "List locally saved FLUX 3 video renders and draft-cache availability.",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/bfl/flux3-video"))
);

server.registerTool(
  "list_video_upscales",
  {
    title: "List FLUX 3 Video Upscales",
    description: "List locally saved FLUX 3 Video Upscale outputs with source and comparison URLs.",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/bfl/video-upscale"))
);

server.registerTool(
  "list_evaluations",
  {
    title: "List Generation Evaluations",
    description:
      "List normalized image and video generation records with prompts, settings, lifecycle timing, costs, outputs, provenance, and human evaluation annotations.",
    inputSchema: {
      id: z.string().optional(),
      mediaType: z.enum(["image", "video"]).optional(),
      model: z.string().optional(),
      verdict: z.enum(["unreviewed", "keep", "maybe", "reject"]).optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional()
    }
  },
  async (filters) => result(await requestJson(withParams("/api/evaluations", filters)))
);

server.registerTool(
  "update_evaluation",
  {
    title: "Update Generation Evaluation",
    description: "Rate, classify, tag, or annotate one captured generation for model comparison.",
    inputSchema: {
      id: z.string().min(1),
      rating: z.number().int().min(1).max(5).optional(),
      verdict: z.enum(["unreviewed", "keep", "maybe", "reject"]).optional(),
      tags: z.array(z.string()).max(20).optional(),
      notes: z.string().max(4000).optional()
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async ({ id, ...annotation }) => result(await patch(withParams("/api/evaluations", { id }), annotation))
);

server.registerTool(
  "generate_flux3_video",
  {
    title: "Generate FLUX 3 Video",
    description:
      "Generate and locally save FLUX 3 text-to-video, image-to-video, video continuation, or deterministic draft enhancement output.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload }) => result(await post("/api/bfl/flux3-video", payload))
);

server.registerTool(
  "upscale_video",
  {
    title: "Upscale Video with FLUX 3",
    description:
      "Upscale and locally save an MP4 with FLUX 3 Video Upscale. Supports 1.5×–3×, precise or creative recovery, an optional detail prompt, and safety tolerance 0–4.",
    inputSchema: {
      inputVideo: z.string().min(1).describe("Raw base64, data URL, HTTP(S) URL, or a saved local dashboard video URL."),
      upscaleFactor: z.number().min(1.5).max(3).optional(),
      creativity: z.union([z.literal(0), z.literal(1)]).optional().describe("0 precise, 1 creative."),
      prompt: z.string().max(4000).optional(),
      safetyTolerance: z.number().int().min(0).max(4).optional(),
      title: z.string().max(160).optional(),
      sourceAssetId: z.string().optional(),
      sourceName: z.string().optional(),
      sourceWidth: z.number().int().positive().optional(),
      sourceHeight: z.number().int().positive().optional(),
      durationSeconds: z.number().positive().max(20).optional()
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async (payload) => result(await post("/api/bfl/video-upscale", payload))
);

server.registerTool(
  "run_image_tool",
  {
    title: "Run Image Tool",
    description: "Run erase, virtual try-on, outpaint, or deblur through the local dashboard route and save the result.",
    inputSchema: {
      payload: imageToolPayloadSchema
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload }) => result(await post("/api/bfl/tools", payload))
);

server.registerTool(
  "save_prompt",
  {
    title: "Save Prompt",
    description:
      "Save or update a prompt-library record through the local dashboard. Optional additive fields: mediaType (image|video|shared|audio), videoCategory (simple|detailed|sequence|dialogue_sound), tags, videoStructure, provenance.",
    inputSchema: {
      record: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async ({ record }) => result(await post("/api/prompts", { record }))
);

server.registerTool(
  "delete_prompt",
  {
    title: "Delete Prompt",
    description: "Soft-delete a prompt-library record and archive it to the local recovery file.",
    inputSchema: {
      id: z.string().min(1)
    },
    annotations: {
      destructiveHint: true,
      openWorldHint: false
    }
  },
  async ({ id }) => result(await del(withParams("/api/prompts", { id })))
);

server.registerTool(
  "list_reference_archive",
  {
    title: "List Reference Archive",
    description: "List synced reference archive items from the optional R2/D1 Worker.",
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional(),
      setId: z.string().optional()
    }
  },
  async ({ limit, setId }) => result(await requestJson(withParams("/api/reference-archive", { limit, setId })))
);

server.registerTool(
  "sync_reference_archive",
  {
    title: "Sync Reference Archive",
    description: "Upload a collection of reference images to the optional R2/D1 archive.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async ({ payload }) => result(await post("/api/reference-archive", payload))
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

server.registerTool(
  "prepare_caption_job",
  {
    title: "Prepare Caption Job",
    description: "Prepare or spawn a local Codex captioning job for a training collection.",
    inputSchema: {
      payload: z.record(z.string(), z.unknown())
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async ({ payload }) => result(await post("/api/bfl_dashboard/v1/caption_agent", payload))
);

server.registerTool(
  "build_finetune_dataset",
  {
    title: "Build Finetune Dataset",
    description:
      "Export a FLUX.2 [klein] LoRA dataset (flat image + .txt caption sidecars, AI-Toolkit config.yaml, README) from a training collection and save it under the local outputs dir.",
    inputSchema: {
      collection: z.record(z.string(), z.unknown()).describe("Training collection with name, triggerToken, and items[]."),
      config: z.record(z.string(), z.unknown()).optional().describe("Optional AI-Toolkit overrides (resolution, rank, steps, datasetDir, outputDir).")
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async ({ collection, config }) => result(await post("/api/finetune/dataset", { collection, config }))
);

server.registerTool(
  "register_finetune",
  {
    title: "Register Finetune",
    description:
      "Register or update a BFL hosted finetune by finetune_id (from a manual BFL Dashboard upload). Clamps defaultStrength to 0..2.",
    inputSchema: {
      finetuneId: z.string().min(1).describe("The finetune_id returned by the BFL Dashboard."),
      label: z.string().optional(),
      triggerWord: z.string().optional(),
      defaultStrength: z.number().optional().describe("0..2, default 1.2."),
      comment: z.string().optional(),
      id: z.string().optional().describe("Existing registry id to update in place.")
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: false
    }
  },
  async (record) => result(await post("/api/finetunes", { record }))
);

server.registerTool(
  "list_finetunes",
  {
    title: "List Finetunes",
    description: "List registered BFL hosted finetunes (finetune_id, trigger word, default strength).",
    inputSchema: {}
  },
  async () => result(await requestJson("/api/finetunes"))
);

server.registerTool(
  "generate_with_finetune",
  {
    title: "Generate With Finetune",
    description:
      "Generate through the hosted FLUX.2 [klein] finetuned endpoint using a registered finetune_id, and save the result into the dashboard gallery.",
    inputSchema: {
      finetuneId: z.string().min(1).describe("Registered finetune_id to generate with."),
      prompt: z.string().min(1),
      finetuneStrength: z.number().optional().describe("0..2, default 1.2."),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      seed: z.number().nullable().optional(),
      outputFormat: z.enum(["png", "jpeg", "webp"]).optional(),
      references: z.array(z.string().min(1)).max(4).optional(),
      title: z.string().optional(),
      apiKey: z.string().optional()
    },
    annotations: {
      destructiveHint: false,
      openWorldHint: true
    }
  },
  async (payload) => result(await post("/api/bfl/generate", payload))
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`BFL Dashboard MCP connected to ${baseUrl}`);
