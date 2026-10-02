import {
  agentRouteMap,
  localAgentCoverage,
  localDashboardMcpTools,
  localMcpParityNotes,
  nativeFluxMcp
} from "@/lib/agent-routes";
import { CAMERA_GUIDE_URL, cameraSections } from "@/lib/camera-language";

export const agentWorkflowGuide = {
  name: "FLUX Control Surface Agent Guide",
  purpose:
    "Pair the hosted FLUX MCP with this local workbench API so agents can generate with BFL while keeping prompts, references, audio guides, tools, finetunes, and recovered outputs visible in the dashboard.",
  nativeFluxMcp: {
    serverUrl: nativeFluxMcp.serverUrl,
    role:
      "Use the hosted FLUX MCP when the MCP client should directly generate images or FLUX 3 video, edit, vary, browse history, or check BFL credits through OAuth.",
    tools: nativeFluxMcp.tools.map((tool) => tool.name),
    commands: nativeFluxMcp.install
  },
  localWorkbench: {
    role:
      "Use the local dashboard routes when the agent should work with prompt libraries, saved outputs, reference roles, audio guide files, image-tool provenance, finetune registry records, local archives, or UI-visible artifacts.",
    mcpWrapper: {
      tools: localDashboardMcpTools,
      coverage: localMcpParityNotes.wrapper,
      httpOnly: localMcpParityNotes.httpOnly
    },
    routes: {
      guide: agentRouteMap.mcpGuide,
      context: agentRouteMap.dashboardContext,
      manifest: agentRouteMap.mcpManifest,
      runPlan: agentRouteMap.runPlan,
      batch: agentRouteMap.batch,
      queue: agentRouteMap.queue,
      videoScriptPlan: agentRouteMap.videoScriptPlan,
      generate: agentRouteMap.generate,
      tools: agentRouteMap.tools,
      flux3Image: agentRouteMap.flux3Image,
      flux3Video: agentRouteMap.flux3Video,
      videoUpscale: agentRouteMap.videoUpscale,
      videoEdit: agentRouteMap.videoEdit,
      videoTrim: agentRouteMap.videoTrim,
      providerJobs: agentRouteMap.providerJobs,
      glyphVectorize: agentRouteMap.glyphVectorize,
      outputs: agentRouteMap.outputs,
      collections: agentRouteMap.collections,
      evaluations: agentRouteMap.evaluations,
      prompts: agentRouteMap.prompts,
      audioGuide: agentRouteMap.audioGuide,
      audioSlice: agentRouteMap.audioSlice,
      captionAgent: agentRouteMap.captionAgent,
      finetuneDataset: agentRouteMap.finetuneDataset,
      finetunes: agentRouteMap.finetunes
    },
    cli: {
      command: "npm run --silent cli -- <command>",
      baseUrlEnvironment: "BFL_DASHBOARD_URL",
      role: "Thin JSON/JSONL client over the same local HTTP routes used by the dashboard and MCP.",
      parity: "Every local MCP tool has a command on the same route; run the help command for the list."
    }
  },
  useTogether: [
    "Ask the hosted FLUX MCP for quick creative exploration, variations, or BFL account history.",
    "Use this local workbench API when the result should become a durable dashboard asset, prompt-library entry, reference set, audio/video guide, captioning job, or finetune registry entry.",
    "When an agent uses /api/bfl/generate, /api/bfl/flux3-image, /api/bfl/tools, or /api/dashboard/batch, the output is saved locally and can be recovered through /api/outputs.",
    "Read and score saved outputs through /api/evaluations, the local MCP tools, or npm run --silent cli -- evaluations without scraping the browser."
  ],
  workflows: [
    {
      name: "Capture and evaluate model outputs",
      steps: [
        `Generate through ${agentRouteMap.generate}, ${agentRouteMap.flux3Image}, ${agentRouteMap.tools}, ${agentRouteMap.flux3Video}, ${agentRouteMap.videoEdit}, or ${agentRouteMap.videoUpscale}`,
        `GET ${agentRouteMap.evaluations} or call list_evaluations`,
        `PATCH ${agentRouteMap.evaluations}?id=<generationId> or call update_evaluation`,
        "Export JSON/JSONL from the Runs tab or npm run --silent cli -- evaluations --format jsonl"
      ]
    },
    {
      name: "Generate or edit with FLUX 3 Image",
      steps: [
        `POST ${agentRouteMap.flux3Image} with mode t2i, i2i, edit or precise (or call generate_flux3_image, or npm run --silent cli -- generate-flux3-image)`,
        "Place elements with boxes rather than a mask: layout[] for text to image, regions[] with an action (change, keep, move, remove) for a precise edit, each in the pixels of frame { width, height }",
        "The server writes the boxes into the prompt as BFL's [top, left, bottom, right] rows on a 0-1000 grid; a precise edit keeps the source's aspect ratio",
        `Add wait=false to get a queue job id at once and follow it through ${agentRouteMap.queue}`,
        `GET ${agentRouteMap.outputs}: the saved image records its mode, settings and the prompt BFL expanded the request into`
      ]
    },
    {
      name: "Upscale a saved FLUX 3 video",
      steps: [
        `GET ${agentRouteMap.outputs} or ${agentRouteMap.flux3Video}`,
        `POST ${agentRouteMap.videoUpscale} with inputVideo and upscaleFactor 1.5 through 3`,
        `GET ${agentRouteMap.videoUpscale} for the saved source/result comparison URLs`,
        `GET ${agentRouteMap.outputs} to recover the result in Assets`
      ]
    },
    {
      name: "Direct a FLUX 3 video: camera, look and effects",
      steps: [
        `POST ${agentRouteMap.flux3Video} (t2v, i2v or v2v) with the scene as prompt and camera.selection naming at most one term per section (null for none)`,
        "Optional camera.edits rewrites a chosen term's clause; the server appends the clauses after the scene exactly once",
        `GET ${agentRouteMap.flux3Video} or ${agentRouteMap.outputs}: each render records camera.terms and the scene`
      ]
    },
    {
      name: "Edit a saved clip with one instruction",
      steps: [
        `GET ${agentRouteMap.outputs} or ${agentRouteMap.flux3Video}`,
        `Over 15 seconds? POST ${agentRouteMap.videoTrim} first (or call trim_video) — local ffmpeg, free`,
        `POST ${agentRouteMap.videoEdit} with inputVideo and a prompt that names only the change (or call edit_video)`,
        `GET ${agentRouteMap.videoEdit} for the saved source/result comparison URLs`,
        `Chain passes: POST ${agentRouteMap.videoEdit} again with the result URL as inputVideo, or hand it to ${agentRouteMap.videoUpscale}`
      ]
    },
    {
      name: "Prompt combo or script",
      steps: [
        `GET ${agentRouteMap.dashboardContext}`,
        `POST ${agentRouteMap.runPlan}`,
        `POST ${agentRouteMap.batch} with execute=true when local files and gallery recovery are required`,
        `GET ${agentRouteMap.outputs}`
      ]
    },
    {
      name: "Use a gallery image as a reference",
      steps: [
        `GET ${agentRouteMap.outputs}`,
        "Use imageUrl or imageDataUrl from the selected asset in references[]",
        `POST ${agentRouteMap.runPlan} for dry-run/cost planning`,
        `POST ${agentRouteMap.videoScriptPlan} to plan FLUX 3 Video Script permutation batches (free) and get queue-ready jobs`,
        `POST ${agentRouteMap.generate} or ${agentRouteMap.batch}`
      ]
    },
    {
      name: "Erase, virtual try-on, outpaint, or deblur a saved image",
      steps: [
        `GET ${agentRouteMap.outputs}`,
        `POST ${agentRouteMap.tools} with tool=erase, vto, outpaint, or deblur`,
        `GET ${agentRouteMap.outputs} to recover the edited result`
      ]
    },
    {
      name: "Vectorize saved images into glyph assets",
      steps: [
        `GET ${agentRouteMap.outputs}`,
        `POST ${agentRouteMap.glyphVectorize} with sourceAssetId and colors=2 or colors=4`,
        `GET ${agentRouteMap.outputs} to recover the SVG/PNG glyph assets`
      ]
    },
    {
      name: "Audio guide assets",
      steps: [
        "Use the Audio tab for browser waveform analysis, marker editing, and prompt composition",
        `POST ${agentRouteMap.audioGuide} when the agent already has an analysis + marker payload`,
        `POST ${agentRouteMap.audioSlice} to cut/loop uploaded audio for downstream video models`
      ]
    },
    {
      name: "Caption a training collection",
      steps: [
        "Build or import a collection in the Collections tab",
        `POST ${agentRouteMap.captionAgent} with collection items and dryRun=true to inspect the job`,
        "Run without dryRun when the Codex CLI should caption the collection folder"
      ]
    },
    {
      name: "Export/register/use a klein LoRA finetune",
      steps: [
        "Build or import a collection and make sure each item has an imageDataUrl plus caption",
        `POST ${agentRouteMap.finetuneDataset} to write the LoRA sidecars, AI-Toolkit config, and dataset README`,
        "Upload/train the exported dataset in the BFL Dashboard to obtain a finetune_id",
        `POST ${agentRouteMap.finetunes} to register the hosted finetune locally`,
        `POST ${agentRouteMap.generate} with finetuneId and optional finetuneStrength, or call generate_with_finetune`
      ]
    }
  ],
  cameraLanguage: {
    guide: CAMERA_GUIDE_URL,
    appliesTo: "FLUX 3 video modes t2v, i2v and v2v (not draft_enhance)",
    sections: cameraSections.map((section) => ({ id: section.id, terms: section.terms.map((term) => term.id) }))
  },
  currentGaps: [
    {
      capability: "Binary audio export through the stdio MCP wrapper",
      status:
        "The HTTP routes can render guide MP4s and audio slices, but the stdio wrapper currently avoids returning large binary media as JSON text."
    },
    {
      capability: "Full browser/UI control",
      status:
        "The local MCP wrapper exposes server-side dashboard routes, but driving the live React UI still needs a browser automation client."
    },
    {
      capability: "Audio analysis from a raw audio file",
      status:
        "Browser-side today. The server can render guide videos and slice audio when supplied with the analysis/marker payload."
    },
    {
      capability: "Agent file drop/import into browser storage",
      status:
        "Browser-local today. Agents can use URLs, data URLs, saved outputs, and remote archive records; arbitrary local drag/drop is not an HTTP route yet."
    },
    {
      capability: "Live push updates after outside agent actions",
      status:
        "The gallery polls /api/outputs for server-created assets. A server-sent event channel would make this instant instead of periodic."
    }
  ],
  examples: [
    "Create a two-prompt permutation plan from the cybernetic flower library, then execute it locally so outputs appear in the dashboard.",
    "Use this recovered gallery image as @character and another as @style, then generate four FLUX.2 Pro options.",
    "Generate a 16:9 FLUX 3 image at 2k with a title box across the top third and the subject in the lower right, then recover it through /api/outputs.",
    "Edit this saved image with FLUX 3 Image: keep the background box unchanged and change the boxed jacket to red leather.",
    "Outpaint this saved output to 16:9, save the result, and make it available in /api/outputs.",
    "Deblur this imported source image, then use the sharpened result as a gallery reference.",
    "Export this collection as a FLUX.2 [klein] LoRA dataset, register the hosted finetune_id, then generate with strength 1.2.",
    "Given audio markers, render an audio-reactive guide MP4 and attach it to the next video-model prompt record.",
    "Vectorize these four saved outputs into two-color and four-color SVG glyphs, then recover them through the gallery.",
    "Generate a FLUX 3 video from request.json with the CLI, then list and rate its captured evaluation record.",
    "Upscale a saved FLUX 3 clip at 2× in precise mode, then compare source and result in the Upscale tab.",
    "Render a FLUX 3 text-to-video shot as a low-angle close-up with a slow orbit, using camera.selection instead of hand-written camera prose.",
    "Edit a saved FLUX 3 clip so the orange bucket is gone, compare before and after in the Edit tab, then upscale the result.",
    "Save a video prompt with save_prompt using mediaType video, a videoCategory, and structured beats, then read it back grouped in the Video prompt library."
  ],
  coverage: localAgentCoverage,
  sources: [
    "https://docs.bfl.ai/api_integration/mcp_integration",
    "https://github.com/black-forest-labs/flux-mcp"
  ]
};
