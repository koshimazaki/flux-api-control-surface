export type AgentRoute = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
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
  videoScriptPlan: "/api/dashboard/video-script-plan",
  batch: "/api/dashboard/batch",
  queue: "/api/dashboard/queue",
  generate: "/api/bfl/generate",
  flux3Video: "/api/bfl/flux3-video",
  tools: "/api/bfl/tools",
  providerJobs: "/api/bfl/jobs",
  glyphVectorize: "/api/glyphs/vectorize",
  credits: "/api/bfl/credits",
  apiKey: "/api/bfl/key",
  outputs: "/api/outputs",
  evaluations: "/api/evaluations",
  collections: "/api/collections",
  referenceArchive: "/api/reference-archive",
  audioGuide: "/api/audio/guide",
  audioSlice: "/api/audio/slice",
  mcpStatus: "/api/mcp/status",
  mcpManifest: "/api/mcp/manifest",
  mcpGuide: "/api/mcp/guide",
  apiManifest: "/api/bfl_dashboard/v1/manifest",
  captionAgent: "/api/bfl_dashboard/v1/caption_agent",
  finetuneDataset: "/api/finetune/dataset",
  finetunes: "/api/finetunes"
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
    path: agentRouteMap.videoScriptPlan,
    purpose:
      "Plan a deterministic FLUX.3 Video Script batch: pools (asset ids or a Collection), pin/vary generator workflows, prompt assignment, timing templates, dedupe, hard caps, and per-second cost — returns queue-ready jobs for /api/dashboard/queue without spending anything.",
    sideEffects: false,
    category: "generation",
    example: {
      pools: [{ collectionId: "col_example" }],
      generator: { workflow: "sequence", poolId: "col_example", slotCount: 4, mode: "combination" },
      prompts: [{ text: "Image 1 morphs into image 2, studio lighting." }],
      settings: { duration: 8 },
      hardCap: 12
    }
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
    method: "GET",
    path: agentRouteMap.queue,
    purpose:
      "List the server-owned generation queue: compact jobs, lifecycle summary, lane limits, pause state, quarantined sources, and runner lease status.",
    sideEffects: false,
    category: "generation"
  },
  {
    method: "POST",
    path: agentRouteMap.queue,
    purpose:
      "Enqueue one or more image, tool, or video jobs onto the server-owned queue. Work runs without an open dashboard tab.",
    sideEffects: "Only when the enqueued jobs execute",
    category: "generation",
    auth: "Uses apiKey in each job payload, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    body: {
      jobs: "Array of { kind: image|tool|video, payload, operation?, priority?, dependsOn?, batchId? }"
    },
    example: {
      jobs: [
        { kind: "image", payload: { prompt: "a cybernetic flower", width: 1024, height: 1024 } },
        { kind: "tool", payload: { tool: "deblur", image: "/api/outputs/abc/image" } }
      ]
    }
  },
  {
    method: "PATCH",
    path: agentRouteMap.queue,
    purpose:
      "Control the queue: pause, resume, retry, cancel, reorder by priority, change concurrency settings, or clear settled jobs.",
    sideEffects: true,
    category: "generation",
    body: {
      action: "pause | resume | retry | cancel | priority | settings | clear-settled",
      id: "Queue job id for retry, cancel, and priority.",
      priority: "Number, higher runs sooner.",
      globalLimit: "Global concurrency for action=settings.",
      laneLimits: "{ image, tool, video } for action=settings."
    }
  },
  {
    method: "DELETE",
    path: agentRouteMap.queue,
    purpose: "Cancel a running queue job, remove a settled one with remove=true, or clear all settled jobs with settled=true.",
    sideEffects: true,
    category: "generation"
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
      normalizeReferences: true,
      referenceWeight: 80,
      width: 1024,
      height: 1024,
      outputFormat: "png"
    }
  },
  {
    method: "GET",
    path: agentRouteMap.flux3Video,
    purpose: "List locally saved FLUX.3 video outputs, including draft-cache availability and local playback URLs.",
    sideEffects: false,
    category: "assets"
  },
  {
    method: "GET",
    path: agentRouteMap.evaluations,
    purpose:
      "List normalized image/video generation records with prompts, settings, lifecycle timings, costs, local outputs, provenance, and evaluation annotations. Use format=jsonl for agent pipelines.",
    sideEffects: false,
    category: "agent"
  },
  {
    method: "PATCH",
    path: agentRouteMap.evaluations,
    purpose: "Save a 1–5 rating, keep/maybe/reject verdict, tags, and notes for one captured generation.",
    sideEffects: true,
    category: "agent",
    body: {
      id: "Generation id (body or ?id=)",
      rating: "optional integer 1..5",
      verdict: "unreviewed | keep | maybe | reject",
      tags: "optional string[]",
      notes: "optional string"
    }
  },
  {
    method: "POST",
    path: agentRouteMap.flux3Video,
    purpose:
      "Generate FLUX.3 video from text, one to ten image keyframes, or an existing MP4; or enhance a saved draft deterministically. Polls, downloads, and saves the video locally.",
    sideEffects: true,
    category: "generation",
    auth: "Uses apiKey in request body, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    body: {
      t2v: "mode=t2v, prompt, duration, aspectRatio, resolution, generateAudio, draft",
      i2v: "mode=i2v, prompt, keyframes[1..10], duration, aspectRatio, resolution, generateAudio, draft",
      v2v: "mode=v2v, prompt, startVideo (MP4 URL/base64), duration 5..15, resolution, generateAudio, draft",
      draftEnhance: "mode=draft_enhance, draftCacheId or draftCache, resolution"
    },
    example: {
      mode: "t2v",
      prompt: "A fox running through dawn mist, synchronized footfalls and forest ambience.",
      duration: 8,
      resolution: "hd",
      generateAudio: true,
      draft: true
    }
  },
  {
    method: "POST",
    path: agentRouteMap.tools,
    purpose:
      "Run FLUX image tools on an existing image: erase, virtual try-on, outpaint, or deblur. Saves outputs like /api/bfl/generate and records sourceAssetId provenance.",
    sideEffects: true,
    category: "tools",
    auth: "Uses apiKey in request body, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    body: {
      erase: "tool=image, mask, dilatePixels, seed, outputFormat png|jpeg",
      vto: "tool=image, garments[], prompt, seed, safetyTolerance, outputFormat",
      outpaint: "tool=image, canvasWidth, canvasHeight, offsetX, offsetY, mode, autoCrop, outputFormat png|jpeg",
      deblur: "tool=image, seed, safetyTolerance, outputFormat"
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
    path: agentRouteMap.providerJobs,
    purpose:
      "Submit one queued provider operation and persist its BFL request id and polling URL before responding. Recovery primitive for the server queue, not a second scheduler.",
    sideEffects: true,
    category: "generation",
    auth: "Uses apiKey in the payload, BFL_API_KEY/FLUX_API_KEY server env, or macOS Keychain.",
    body: {
      id: "Existing queue job id to submit.",
      kind: "image | tool | video when enqueueing a new job instead.",
      payload: "The same request body the matching /api/bfl/* route accepts."
    }
  },
  {
    method: "GET",
    path: agentRouteMap.providerJobs,
    purpose:
      "Run exactly one poll step for a queue job using its stored polling URL. Client-supplied polling URLs are never accepted.",
    sideEffects: false,
    category: "generation"
  },
  {
    method: "PATCH",
    path: agentRouteMap.providerJobs,
    purpose: "Finalize a Ready provider result once: download the expiring delivery URL, save it locally, reconcile cost.",
    sideEffects: true,
    category: "generation"
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
    path: agentRouteMap.collections,
    purpose: "List gallery moodboard/project collections shared by the browser UI and local agents.",
    sideEffects: false,
    category: "assets"
  },
  {
    method: "POST",
    path: agentRouteMap.collections,
    purpose: "Create a gallery collection with optional asset members.",
    sideEffects: true,
    category: "assets"
  },
  {
    method: "PATCH",
    path: agentRouteMap.collections,
    purpose: "Rename or update a gallery collection, including adding asset members.",
    sideEffects: true,
    category: "assets"
  },
  {
    method: "DELETE",
    path: agentRouteMap.collections,
    purpose: "Delete a gallery collection, or remove one asset from it when assetId is supplied.",
    sideEffects: true,
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
    purpose:
      "Return the bundled public example prompt library. Records may carry optional media metadata (mediaType, videoCategory, tags, videoStructure, provenance); records saved without it are image prompts.",
    sideEffects: false,
    category: "prompts"
  },
  {
    method: "POST",
    path: agentRouteMap.prompts,
    purpose:
      "Save or update a local prompt record in the example prompt library. Additive optional fields are accepted and normalized: mediaType (image|video|shared|audio), videoCategory (simple|detailed|sequence|dialogue_sound), tags, videoStructure (setup/beats/camera/dialogue/sound/ambience), and provenance (source generation id, settings, rating).",
    sideEffects: true,
    category: "prompts",
    body: {
      record: {
        id: "string",
        prompt: "string",
        domain: "string (optional; video_prompts for the Video library)",
        mediaType: "image | video | shared | audio (optional)",
        videoCategory: "simple | detailed | sequence | dialogue_sound (optional)",
        tags: "string[] (optional)",
        videoStructure: "optional { setup, beats[], camera, dialogue, sound, ambience }",
        provenance: "optional { generationId, evaluationId, templateId, model, rating, verdict, settings }"
      }
    }
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
  },
  {
    method: "POST",
    path: agentRouteMap.finetuneDataset,
    purpose:
      "Export a FLUX.2 [klein] LoRA dataset (flat image + .txt caption sidecars, AI-Toolkit config.yaml, README) from a training collection and save it under the local outputs dir.",
    sideEffects: true,
    category: "agent",
    body: {
      collection: {
        name: "string",
        triggerToken: "string",
        items: "array of collection items with imageDataUrl + caption"
      },
      config: "Optional AI-Toolkit overrides (resolution, rank, steps, learningRate, datasetDir, outputDir)."
    }
  },
  {
    method: "GET",
    path: agentRouteMap.finetunes,
    purpose: "List registered BFL hosted finetunes (finetune_id, trigger word, default strength).",
    sideEffects: false,
    category: "agent"
  },
  {
    method: "POST",
    path: agentRouteMap.finetunes,
    purpose:
      "Register or update a BFL hosted finetune by finetune_id. Clamps defaultStrength to 0..2 and pins baseModel to flux2-klein-9b.",
    sideEffects: true,
    category: "agent",
    body: {
      finetuneId: "string (required, from the BFL Dashboard upload)",
      label: "string",
      triggerWord: "string",
      defaultStrength: "number 0..2 (default 1.2)",
      comment: "string"
    }
  },
  {
    method: "DELETE",
    path: agentRouteMap.finetunes,
    purpose: "Remove a registered finetune by id or finetune_id from the local gitignored registry.",
    sideEffects: true,
    category: "agent"
  }
];

export const localAgentCoverage = {
  generation:
    "Image generation is wired through /api/dashboard/run-plan, /api/dashboard/batch, and /api/bfl/generate. FLUX.3 video generation, draft enhancement, and local video recovery are wired through /api/bfl/flux3-video. Every paid entry point enqueues onto the server-owned queue and waits, so execution, retry, and recovery are identical from the browser, MCP, and CLI.",
  queue:
    "One server-owned, file-backed generation queue runs image, tool, and video lanes with a renewable single-runner lease. Inspect and control it through /api/dashboard/queue; repair individual provider jobs through /api/bfl/jobs.",
  imageTools: "Erase, virtual try-on, outpaint, and deblur are wired through /api/bfl/tools and the image-tool workspace.",
  glyphs:
    "Server-side SVG/PNG glyph vectorization is wired through /api/glyphs/vectorize and saves recoverable local gallery outputs.",
  references:
    "Generation accepts multiple reference image URLs/data URLs. The UI can add references from files, hosted URLs, generated outputs, and asset-library drag/drop.",
  assetLibrary:
    "Server-side agents can read saved filesystem/R2 outputs through /api/outputs. Browser-imported local files live in browser storage until generated or exported.",
  collections:
    "Gallery collections are server-backed moodboard/project folders under /api/collections. The UI can curate them now; dedicated stdio MCP collection tools are a Phase 2 wrapper.",
  audio:
    "Audio slicing and guide rendering are exposed as routes. Browser-side waveform analysis remains a UI workflow; agents can call /api/audio/guide when they already have an analysis payload.",
  finetuning:
    "FLUX.2 [klein] LoRA dataset export, hosted-finetune registration, listing, and finetuned generation are wired through /api/finetune/dataset, /api/finetunes, and /api/bfl/generate.",
  uiSync:
    "Agent-created outputs are visible through /api/outputs and the browser gallery polls for new server outputs. A push event stream is still optional future polish.",
  evaluation:
    "Saved image, tool, and FLUX.3 metadata is normalized through /api/evaluations for UI, MCP, CLI, JSON, and JSONL model review without duplicating generation history.",
  localOnly:
    "Browser-imported files and browser-side waveform analysis still require UI handoff. Saved outputs can be used by server-side agents."
};

export const localDashboardMcpTools = [
  "get_manifest",
  "get_dashboard_context",
  "list_assets",
  "list_prompts",
  "get_api_key_status",
  "check_credits",
  "build_run_plan",
  "plan_video_script",
  "run_batch",
  "list_generation_queue",
  "enqueue_generation_jobs",
  "update_generation_job",
  "cancel_generation_job",
  "generate_saved_image",
  "list_flux3_videos",
  "list_evaluations",
  "update_evaluation",
  "generate_flux3_video",
  "run_image_tool",
  "save_prompt",
  "delete_prompt",
  "list_reference_archive",
  "sync_reference_archive",
  "vectorize_glyph",
  "vectorize_glyph_batch",
  "prepare_caption_job",
  "build_finetune_dataset",
  "register_finetune",
  "list_finetunes",
  "generate_with_finetune"
];

export const localMcpParityNotes = {
  wrapper:
    "The stdio MCP wrapper covers the local JSON dashboard routes for discovery, assets, prompts, planning, generation, the server-owned generation queue, evaluation, image tools, references, glyphs, credits, caption job prep, and finetune dataset/registry workflows.",
  httpOnly:
    "Audio guide rendering and audio slicing remain HTTP/UI workflows because those routes return binary media. Gallery collection CRUD is currently HTTP/UI while dedicated MCP collection tools are deferred. Browser waveform analysis, drag/drop import, mask painting, and live React control remain UI or browser-automation workflows."
};

export const mcpStatusRoutes = Array.from(
  new Set(dashboardAgentRoutes.filter((route) => route.method !== "DELETE").map((route) => route.path))
);
