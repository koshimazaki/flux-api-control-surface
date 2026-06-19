export type AgentRoute = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  purpose: string;
  sideEffects: boolean | string;
  category: "discovery" | "generation" | "tools" | "assets" | "audio" | "prompts" | "agent";
  auth?: string;
  body?: Record<string, unknown>;
  example?: Record<string, unknown>;
};

export const nativeFluxMcp = {
  serverUrl: "https://mcp.bfl.ai",
  install: {
    add: "codex mcp add FLUX --url https://mcp.bfl.ai",
    login: "codex mcp login FLUX",
    list: "codex mcp list"
  },
  tools: [
    {
      name: "generate_image",
      purpose: "Generate one image or a small parallel batch with FLUX models.",
      notes: "Use native BFL MCP when the MCP client should own generation/history directly."
    },
    {
      name: "generate_variations",
      purpose: "Create variations from a previous BFL request."
    },
    {
      name: "get_history",
      purpose: "Browse previous FLUX generations."
    },
    {
      name: "get_credits",
      purpose: "Check BFL credit balance."
    }
  ]
};

export const agentRouteMap = {
  prompts: "/api/prompts",
  dashboardContext: "/api/dashboard/context",
  runPlan: "/api/dashboard/run-plan",
  batch: "/api/dashboard/batch",
  generate: "/api/bfl/generate",
  tools: "/api/bfl/tools",
  glyphVectorize: "/api/glyphs/vectorize",
  credits: "/api/bfl/credits",
  apiKey: "/api/bfl/key",
  outputs: "/api/outputs",
  referenceArchive: "/api/reference-archive",
  audioGuide: "/api/audio/guide",
  audioSlice: "/api/audio/slice",
  mcpStatus: "/api/mcp/status",
  mcpManifest: "/api/mcp/manifest",
  mcpGuide: "/api/mcp/guide",
  apiManifest: "/api/bfl_dashboard/v1/manifest",
  captionAgent: "/api/bfl_dashboard/v1/caption_agent"
};

export const dashboardAgentRoutes: AgentRoute[] = [
  {
    method: "GET",
    path: agentRouteMap.mcpManifest,
    purpose: "Describe all local agent/MCP-facing routes and native FLUX MCP handoff options.",
    sideEffects: false,
    category: "discovery"
  },
  {
    method: "GET",
    path: agentRouteMap.mcpStatus,
    purpose: "Return short operational status for the MCP tab and local HTTP bridge.",
    sideEffects: false,
    category: "discovery"
  },
  {
    method: "GET",
    path: agentRouteMap.mcpGuide,
    purpose: "Return the paired native FLUX MCP plus local workbench API guide for humans and agents.",
    sideEffects: false,
    category: "discovery"
  },
  {
    method: "GET",
    path: agentRouteMap.apiManifest,
    purpose: "Describe stable bfl_dashboard/v1 routes intended for Codex and other local agents.",
    sideEffects: false,
    category: "discovery"
  },
  {
    method: "GET",
    path: agentRouteMap.dashboardContext,
    purpose: "Return models, example prompts, output metadata, auth expectations, and route map.",
    sideEffects: false,
    category: "discovery"
  },
  {
    method: "GET",
    path: agentRouteMap.apiKey,
    purpose: "Report whether a FLUX API key is configured through server env or macOS Keychain. Never returns the raw key.",
    sideEffects: false,
    category: "discovery"
  },
  {
    method: "POST",
    path: agentRouteMap.runPlan,
    purpose: "Build concrete generation request bodies from prompt IDs, prompt queue, permutations, or inline prompt.",
    sideEffects: false,
    category: "generation",
    example: {
      batchMode: "permutations",
      promptIds: ["tropical_membrane_flower_01", "sea_anemone_flower_02", "rafflesia_01"],
      permutationSize: 2,
      count: 10,
      parallel: 4,
      model: "pro-preview",
      width: 1024,
      height: 1024,
      hasReferences: true,
      referenceCue: "Use @character for subject identity and @style for material language.",
      outputFormat: "png"
    }
  },
  {
    method: "POST",
    path: agentRouteMap.batch,
    purpose:
      "Plan or execute a sequential control-surface batch that saves image, prompt, and metadata locally and, when configured, to R2/D1.",
    sideEffects: "Only when execute=true",
    category: "generation",
    auth: "Uses apiKey in request body, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    example: {
      execute: false,
      batchMode: "library",
      startId: "tropical_membrane_flower_01",
      count: 10,
      references: ["https://example.com/reference.png"],
      model: "pro-preview",
      width: 1024,
      height: 1024,
      outputFormat: "png"
    }
  },
  {
    method: "POST",
    path: agentRouteMap.generate,
    purpose:
      "Call the FLUX HTTP API once with optional reference images, poll the result, save local output files, and optionally sync the archive Worker.",
    sideEffects: true,
    category: "generation",
    auth: "Uses apiKey in request body, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    example: {
      model: "pro-preview",
      prompt: "A clean cybernetic botanical specimen, macro product-style image.",
      references: ["https://example.com/character.png", "data:image/png;base64,..."],
      referenceWeight: 80,
      width: 1024,
      height: 1024,
      outputFormat: "png"
    }
  },
  {
    method: "POST",
    path: agentRouteMap.tools,
    purpose:
      "Run FLUX image tools on an existing image: erase, inpaint, or outpaint. Saves outputs like /api/bfl/generate and records sourceAssetId provenance.",
    sideEffects: true,
    category: "tools",
    auth: "Uses apiKey in request body, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    body: {
      erase: "tool=image, mask, dilatePixels",
      inpaint: "tool=image, mask, prompt, seed",
      outpaint: "tool=image, canvasWidth, canvasHeight, offsetX, offsetY, mode"
    },
    example: {
      tool: "outpaint",
      image: "https://... or data:image/png;base64,...",
      canvasWidth: 1536,
      canvasHeight: 1024,
      offsetX: 256,
      offsetY: null,
      mode: "high",
      prompt: "extend the botanical scene"
    }
  },
  {
    method: "POST",
    path: agentRouteMap.glyphVectorize,
    purpose:
      "Vectorize an existing image or saved output into a local SVG glyph plus PNG preview, then save both into the dashboard output gallery.",
    sideEffects: true,
    category: "tools",
    body: {
      image: "Optional image URL/data URL. If omitted, sourceAssetId is resolved from /api/outputs/:id/image.",
      sourceAssetId: "Saved dashboard output id to vectorize.",
      colors: "Palette size, usually 2 or 4 for glyph work.",
      selection: "Optional crop rect {x,y,width,height}; defaults to the whole image.",
      targetMode: "square or native"
    },
    example: {
      sourceAssetId: "rafflesia-01",
      colors: 4,
      minArea: 8,
      knockoutBackground: true,
      targetMode: "square"
    }
  },
  {
    method: "POST",
    path: agentRouteMap.credits,
    purpose: "Check FLUX API credits through the control-surface server.",
    sideEffects: false,
    category: "generation",
    auth: "Uses apiKey in request body, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain."
  },
  {
    method: "GET",
    path: agentRouteMap.outputs,
    purpose: "Hydrate saved filesystem and configured R2/D1 archive outputs back into the dashboard asset library.",
    sideEffects: false,
    category: "assets"
  },
  {
    method: "GET",
    path: agentRouteMap.referenceArchive,
    purpose: "List or browse the synced training reference archive from R2/D1.",
    sideEffects: false,
    category: "assets"
  },
  {
    method: "GET",
    path: agentRouteMap.prompts,
    purpose: "Return the bundled public example prompt library.",
    sideEffects: false,
    category: "prompts"
  },
  {
    method: "POST",
    path: agentRouteMap.prompts,
    purpose: "Save or update a local prompt record in the example prompt library.",
    sideEffects: true,
    category: "prompts"
  },
  {
    method: "DELETE",
    path: agentRouteMap.prompts,
    purpose: "Soft-delete a prompt record and archive it to a gitignored local recovery file.",
    sideEffects: true,
    category: "prompts"
  },
  {
    method: "POST",
    path: agentRouteMap.audioGuide,
    purpose: "Render an audio-reactive shader guide MP4 from an analysis + marker payload.",
    sideEffects: false,
    category: "audio"
  },
  {
    method: "POST",
    path: agentRouteMap.audioSlice,
    purpose: "Cut and loop an uploaded audio slice to mp3/wav for video-model inputs.",
    sideEffects: false,
    category: "audio"
  },
  {
    method: "POST",
    path: agentRouteMap.captionAgent,
    purpose: "Prepare a LoRA collection captioning job folder and spawn Codex when the CLI is available.",
    sideEffects: true,
    category: "agent",
    body: {
      collection: {
        name: "string",
        triggerToken: "string",
        captionGuide: "string",
        items: "array of image data URLs with optional starting captions"
      },
      dryRun: "boolean"
    }
  }
];

export const localAgentCoverage = {
  generation: "Wired through /api/dashboard/run-plan, /api/dashboard/batch, and /api/bfl/generate.",
  imageTools: "Erase, inpaint, and outpaint are wired through /api/bfl/tools and the image-tool workspace.",
  glyphs:
    "Server-side SVG/PNG glyph vectorization is wired through /api/glyphs/vectorize and saves recoverable local gallery outputs.",
  references:
    "Generation accepts multiple reference image URLs/data URLs. The UI can add references from files, hosted URLs, generated outputs, and asset-library drag/drop.",
  assetLibrary:
    "Server-side agents can read saved filesystem/R2 outputs through /api/outputs. Browser-imported local files live in browser storage until generated or exported.",
  audio:
    "Audio slicing and guide rendering are exposed as routes. Browser-side waveform analysis remains a UI workflow; agents can call /api/audio/guide when they already have an analysis payload.",
  uiSync:
    "Agent-created outputs are visible through /api/outputs and the browser gallery polls for new server outputs. A push event stream is still optional future polish.",
  localOnly:
    "Browser-imported files and browser-side waveform analysis still require UI handoff. Saved outputs can be used by server-side agents."
};

export const mcpStatusRoutes = Array.from(
  new Set(dashboardAgentRoutes.filter((route) => route.method !== "DELETE").map((route) => route.path))
);
