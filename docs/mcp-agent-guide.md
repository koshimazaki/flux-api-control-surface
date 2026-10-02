# MCP And Agent Guide

The dashboard and the official FLUX MCP should be used together.

- **Official FLUX MCP** (`https://mcp.bfl.ai`) is the hosted BFL creative surface:
  OAuth sign-in, direct image and FLUX 3 video generation, edits, virtual
  try-on, variations, history, and credits.
- **This local control surface** is the workbench surface: prompt libraries,
  run plans, the generation queue, saved outputs, collections, reference roles,
  audio guide assets, FLUX image and video tool provenance, evaluation records,
  caption jobs, finetune registry, and UI-visible local artifacts.

In short: use hosted FLUX MCP for direct BFL creative operations; use the local
dashboard API when the work should land back in this repo's gallery, prompts,
audio/script workflow, or output archive.

Agents reach the local surface three ways, all over the same HTTP routes: plain
HTTP, the stdio MCP wrapper, or the CLI. Every local MCP tool has a CLI command
on the same route, so an agent can use whichever it prefers.

## Setup

```bash
codex mcp add FLUX --url https://mcp.bfl.ai
codex mcp login FLUX
```

The dashboard also exposes a local guide for agents:

```bash
curl http://localhost:3017/api/mcp/guide
curl http://localhost:3017/api/mcp/manifest
curl http://localhost:3017/api/dashboard/context
```

For MCP clients that need callable local tools instead of HTTP route discovery,
run the stdio wrapper against the dashboard server:

```bash
cd BFL/ui
BFL_DASHBOARD_URL=http://localhost:3017 npm run mcp
```

Register it in Codex:

```bash
codex mcp add BFL_DASHBOARD --env BFL_DASHBOARD_URL=http://localhost:3017 -- node /absolute/path/to/BFL/ui/mcp/server.mjs
```

For a shell, use the CLI. It prints JSON, reads payloads from a file or stdin
(`--json -`), and takes the same `BFL_DASHBOARD_URL`:

```bash
cd BFL/ui
export BFL_DASHBOARD_URL=http://localhost:3017
npm run --silent cli -- help
npm run --silent cli -- generate-flux3-image --json request.json
echo '{"jobs":[{"kind":"image","operation":"flux3-image","payload":{"mode":"t2i","prompt":"a glass fox at dawn"}}]}' \
  | npm run --silent cli -- enqueue --json -
npm run --silent cli -- queue
```

The local dashboard resolves paid API calls from a per-request `apiKey`,
`BFL_API_KEY`, `FLUX_API_KEY`, or a macOS Keychain item. MCP/status routes report
only whether a key is configured; they never return the raw key.

## Local Tools And Commands

Each row is one capability with its two names. `tests/cli-coverage.test.ts`
fails if a tool is added without a command, or if the two stop sharing a route.

| MCP tool | CLI command | Route |
|---|---|---|
| `get_manifest` | `manifest` | `GET /api/mcp/manifest` |
| `get_dashboard_context` | `context` | `GET /api/dashboard/context` |
| `get_api_key_status` | `key-status` | `GET /api/bfl/key` |
| `check_credits` | `credits` | `POST /api/bfl/credits` |
| `list_assets` | `assets` | `GET /api/outputs` |
| `list_prompts` | `prompts` | `GET /api/prompts` |
| `save_prompt` | `save-prompt` | `POST /api/prompts` |
| `delete_prompt` | `delete-prompt` | `DELETE /api/prompts` |
| `build_run_plan` | `plan` | `POST /api/dashboard/run-plan` |
| `plan_video_script` | `plan-video-script` | `POST /api/dashboard/video-script-plan` |
| `run_batch` | `batch` | `POST /api/dashboard/batch` |
| `list_generation_queue` | `queue` | `GET /api/dashboard/queue` |
| `enqueue_generation_jobs` | `enqueue` | `POST /api/dashboard/queue` |
| `update_generation_job` | `queue-update` | `PATCH /api/dashboard/queue` |
| `cancel_generation_job` | `queue-cancel` | `DELETE /api/dashboard/queue` |
| `generate_saved_image` | `generate-image` | `POST /api/bfl/generate` |
| `generate_with_finetune` | `generate-with-finetune` | `POST /api/bfl/generate` |
| `generate_flux3_image` | `generate-flux3-image` | `POST /api/bfl/flux3-image` |
| `generate_flux3_video` | `generate-video` | `POST /api/bfl/flux3-video` |
| `upscale_video` | `upscale-video` | `POST /api/bfl/video-upscale` |
| `edit_video` | `edit-video` | `POST /api/bfl/video-edit` |
| `trim_video` | `trim-video` | `POST /api/bfl/video-trim` |
| `run_image_tool` | `run-tool` | `POST /api/bfl/tools` |
| `list_flux3_videos` | `videos` | `GET /api/bfl/flux3-video` |
| `list_video_upscales` | `video-upscales` | `GET /api/bfl/video-upscale` |
| `list_video_edits` | `video-edits` | `GET /api/bfl/video-edit` |
| `list_video_trims` | `video-trims` | `GET /api/bfl/video-trim` |
| `list_evaluations` | `evaluations` | `GET /api/evaluations` |
| `update_evaluation` | `evaluate` | `PATCH /api/evaluations` |
| `list_collections` | `collections` | `GET /api/collections` |
| `create_collection` | `create-collection` | `POST /api/collections` |
| `update_collection` | `update-collection` | `PATCH /api/collections` |
| `delete_collection` | `delete-collection` | `DELETE /api/collections` |
| `list_reference_archive` | `reference-archive` | `GET /api/reference-archive` |
| `sync_reference_archive` | `sync-reference-archive` | `POST /api/reference-archive` |
| `vectorize_glyph` | `vectorize-glyph` | `POST /api/glyphs/vectorize` |
| `vectorize_glyph_batch` | `vectorize-glyph-batch` | `POST /api/glyphs/vectorize` |
| `prepare_caption_job` | `caption-job` | `POST /api/bfl_dashboard/v1/caption_agent` |
| `build_finetune_dataset` | `finetune-dataset` | `POST /api/finetune/dataset` |
| `list_finetunes` | `finetunes` | `GET /api/finetunes` |
| `register_finetune` | `register-finetune` | `POST /api/finetunes` |

## Which Surface To Use

| Task | Preferred surface |
|---|---|
| Quick FLUX prompt exploration | Official FLUX MCP |
| Generate variations from BFL history | Official FLUX MCP |
| Check OAuth/BFL account credits | Official FLUX MCP |
| Check whether local paid execution has a key | Local `/api/bfl/key` or `get_api_key_status` |
| Check credits through the local key | Local `/api/bfl/credits` or `check_credits` |
| Plan prompt-library permutations | Local `/api/dashboard/run-plan` |
| Execute a batch and save outputs locally | Local `/api/dashboard/batch` |
| Generate one saved FLUX.2 output | Local `/api/bfl/generate` |
| Generate or edit with FLUX 3 Image, with boxes | Local `/api/bfl/flux3-image` or `generate_flux3_image` |
| Generate FLUX 3 video and keep the draft cache | Local `/api/bfl/flux3-video` or `generate_flux3_video` |
| Plan a keyframe-permutation video batch | Local `/api/dashboard/video-script-plan` or `plan_video_script` |
| Upscale, edit, or cut a saved clip | Local `/api/bfl/video-upscale`, `/api/bfl/video-edit`, `/api/bfl/video-trim` |
| Queue paid work and return at once | Local `/api/dashboard/queue` or `enqueue_generation_jobs` |
| Erase, virtual try-on, outpaint, or deblur a saved image | Local `/api/bfl/tools` |
| Vectorize saved images into SVG/PNG glyphs | Local `/api/glyphs/vectorize` |
| Recover output gallery records | Local `/api/outputs` |
| Group saved assets into collections | Local `/api/collections` or the collection tools |
| Rate and export generation records | Local `/api/evaluations` |
| Render an audio-reactive guide MP4 | Local `/api/audio/guide` HTTP route |
| Slice/loop uploaded audio | Local `/api/audio/slice` HTTP route |
| Prepare a captioning job folder | Local `/api/bfl_dashboard/v1/caption_agent` |
| Export a FLUX.2 [klein] LoRA dataset | Local `/api/finetune/dataset` or `build_finetune_dataset` |
| Register or list hosted finetunes | Local `/api/finetunes`, `register_finetune`, or `list_finetunes` |
| Generate with a registered finetune | Local `/api/bfl/generate` with `finetuneId` or `generate_with_finetune` |

## Agent Workflows

### Prompt Combo Or Script

1. `GET /api/dashboard/context`
2. Pick prompt IDs or create prompt text.
3. `POST /api/dashboard/run-plan`
4. `POST /api/dashboard/batch` with `execute=true` when outputs should be saved.
5. `GET /api/outputs` to recover saved images for the gallery.

### Use Gallery Images As References

1. `GET /api/outputs`
2. Use an asset `imageUrl` or `imageDataUrl` in `references[]`.
3. Add a reference cue such as `Use @character for identity and @style for texture.`
4. `POST /api/dashboard/run-plan`
5. `POST /api/bfl/generate` or `POST /api/dashboard/batch`

Local `/api/outputs/:id/image` URLs are resolved server-side before FLUX API
calls, so recovered images can be used as references without exposing absolute
filesystem paths.

### FLUX 3 Image

`POST /api/bfl/flux3-image` (or `generate_flux3_image`, or the
`generate-flux3-image` command) covers the one BFL endpoint,
`POST /v1/flux-3-image`, in four modes:

- `mode=t2i`: `prompt`, optional `layout[]` boxes `{ x, y, width, height, prompt }`
  with `frame { width, height }`.
- `mode=i2i`: `prompt` and `references[]`, one to ten images, named in the
  prompt as image 1, image 2 and so on.
- `mode=edit`: `prompt` and one `source` image.
- `mode=precise`: `source`, `frame` in source pixels, and `regions[]`
  `{ x, y, width, height, action, prompt, reference?, target? }` where `action`
  is `change`, `keep`, `move` or `remove`.

`settings` takes `aspectRatio`, `resolution` (`768sq`, `1k`, `2k`, `4k`),
`grounding` and `safetyTolerance` (0 to 4). The API has no mask, seed or output
format. Boxes are written into the prompt as BFL's `[top, left, bottom, right]`
rows on a 0 to 1000 grid, each named `<id>` in the caption. A precise edit sends
`aspect_ratio: auto` so the grid lines up with the source.

```json
{
  "mode": "precise",
  "source": "/api/outputs/<id>/image",
  "frame": { "width": 1360, "height": 768 },
  "prompt": "Late afternoon light.",
  "regions": [
    { "x": 120, "y": 90, "width": 420, "height": 380, "action": "change", "prompt": "make the tiger pink" },
    { "x": 0, "y": 460, "width": 1360, "height": 308, "action": "keep", "prompt": "the fallen log" }
  ],
  "settings": { "resolution": "1k" }
}
```

Add `"wait": false` to get a queue job id at once. Without it the call waits up
to about five minutes; a render that takes longer (4k can) answers with
`timedOut: true` and its `queueJobId` and keeps running. The saved image records
its mode, settings and the prompt BFL expanded the request into.

### Queue Paid Work

1. `POST /api/dashboard/queue` with `jobs[]`, each `{ kind, payload }` where
   `kind` is `image`, `tool` or `video` and `payload` is what the matching
   `/api/bfl/*` route takes.
2. Name the product when a lane carries more than one: `operation: "flux3-image"`
   for FLUX 3 Image, `"video-upscale"` or `"video-edit"` for the video tools.
   Without it an image job is FLUX.2 generation and a video job is FLUX 3 video
   in `payload.mode`.
3. `GET /api/dashboard/queue` to follow the jobs; `PATCH` to pause, resume,
   retry, cancel or reprioritize.

The queue keeps running with no browser open, and survives a restart by
resuming accepted jobs from their saved provider request ids.

A call that waits for its result answers within about five minutes. If the
work takes longer, the answer says it is still running and gives its queue job
id: follow that job with `list_generation_queue` or `queue <id>` instead of
sending the request again, which would pay twice. The CLI and the MCP wrapper
say the same when a request ends without an answer, and only say the dashboard
is not running when the connection was refused.

### Image Tool Edit

1. `GET /api/outputs`
2. Select an image URL/data URL.
3. `POST /api/bfl/tools`
   - `tool=erase` needs `image` and `mask`; optional `dilatePixels`, `seed`, `safetyTolerance`, and `outputFormat`.
   - `tool=vto` needs `image`, one or more `garments[]`, and `prompt`; optional `seed`, `safetyTolerance`, and `outputFormat`.
   - `tool=outpaint` needs `image`, `canvasWidth`, and `canvasHeight`; optional offsets, `mode`, `autoCrop`, `safetyTolerance`, `outputFormat`, and prompt guidance.
   - `tool=deblur` needs `image`; optional `seed`, `safetyTolerance`, and `outputFormat`.
4. `GET /api/outputs` to recover the edited result.

### Edit, Upscale Or Cut A Clip

1. `GET /api/bfl/flux3-video` or `GET /api/outputs` for a saved clip URL.
2. Over 15 seconds? `POST /api/bfl/video-trim` first: local ffmpeg, free.
3. `POST /api/bfl/video-edit` with `inputVideo` and a `prompt` naming only the
   change, or `POST /api/bfl/video-upscale` with `upscaleFactor` 1.5 to 3.
4. `GET` the same route for saved before/after comparison URLs.

### Glyph Vectorize

1. `GET /api/outputs`
2. Pick a saved asset id.
3. `POST /api/glyphs/vectorize`
   - `sourceAssetId` resolves `/api/outputs/:id/image`.
   - `colors=2` or `colors=4` gives clean glyph palettes.
   - `selection` is optional and defaults to the full image.
4. `GET /api/outputs` to recover the PNG preview and SVG path.

### Audio Guide

The browser Audio tab currently owns waveform analysis and marker editing. If an
agent already has an analysis + marker payload, it can call:

- `POST /api/audio/guide` to render the guide MP4.
- `POST /api/audio/slice` to cut/loop audio for downstream video models.

### FLUX.2 [klein] Finetune Loop

1. Build or import a collection in the Collections tab.
2. Use `POST /api/bfl_dashboard/v1/caption_agent` when captions need an agent pass.
3. `POST /api/finetune/dataset` to write the LoRA image/caption sidecars,
   `config.yaml`, and dataset README.
4. Upload/train the exported dataset in the BFL Dashboard to obtain a
   `finetune_id`.
5. `POST /api/finetunes` to register the hosted finetune locally.
6. `POST /api/bfl/generate` with `finetuneId` and optional `finetuneStrength`,
   or call `generate_with_finetune` through the local MCP wrapper.

## Current Gaps

These are the main missing pieces for full UI/agent symmetry:

- **Binary audio export through stdio MCP and the CLI:** `/api/audio/guide` and
  `/api/audio/slice` return media files, so they remain HTTP/UI workflows rather
  than JSON tools or commands.
- **Full live browser control:** the local MCP wrapper exposes server-side
  dashboard routes, but it does not drive the live React UI. Drawing boxes and
  painting masks are UI work; an agent sends their coordinates instead.
- **Server audio analysis:** waveform analysis is browser-side; the server can
  render guides after it receives analysis/markers.
- **Agent file drop/import:** arbitrary local drag/drop into browser storage is
  still a UI workflow. Agents can use saved outputs, URLs, data URLs, and remote
  archive records.
- **Live push refresh:** external agent writes are visible via `/api/outputs`,
  and the browser polls for new server outputs. A server-sent event stream would
  make this instant instead of periodic.

## Good Next API Additions

1. `POST /api/audio/analyze` for raw audio file analysis.
2. `POST /api/assets/import` for agent-created local assets.
3. `GET /api/events` so the UI refreshes instantly when agents create outputs.
4. Optional file-return convention for MCP audio/video tools.

## Sources

- [BFL FLUX MCP docs](https://docs.bfl.ai/api_integration/mcp_integration)
- [FLUX 3 Image API reference](https://docs.bfl.ai/api-reference/utility/generate-an-image-with-flux-3)
- [Bounding boxes with FLUX 3 Image](https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes)
- [Official FLUX MCP repository](https://github.com/black-forest-labs/flux-mcp)
