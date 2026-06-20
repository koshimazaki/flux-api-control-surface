# MCP And Agent Guide

The dashboard and the official FLUX MCP should be used together.

- **Official FLUX MCP** (`https://mcp.bfl.ai`) is the hosted BFL creative surface:
  OAuth sign-in, direct generation, edits, variations, history, and credits.
- **This local control surface** is the workbench surface: prompt libraries,
  run plans, saved outputs, reference roles, audio guide assets, FLUX image tool
  provenance, caption jobs, and UI-visible local artifacts.

In short: use hosted FLUX MCP for direct BFL creative operations; use the local
dashboard API when the work should land back in this repo's gallery, prompts,
audio/script workflow, or output archive.

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

The local MCP wrapper exposes the JSON dashboard workflows: `get_manifest`,
`get_dashboard_context`, `list_assets`, `list_prompts`, `get_api_key_status`,
`check_credits`, `build_run_plan`, `run_batch`, `generate_saved_image`,
`run_image_tool`, `save_prompt`, `delete_prompt`, `list_reference_archive`,
`sync_reference_archive`, `vectorize_glyph`, `vectorize_glyph_batch`, and
`prepare_caption_job`.

The local dashboard resolves paid API calls from a per-request `apiKey`,
`BFL_API_KEY`, `FLUX_API_KEY`, or a macOS Keychain item. MCP/status routes report
only whether a key is configured; they never return the raw key.

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
| Generate one saved dashboard output | Local `/api/bfl/generate` |
| Erase, inpaint, or outpaint a saved image | Local `/api/bfl/tools` |
| Vectorize saved images into SVG/PNG glyphs | Local `/api/glyphs/vectorize` |
| Recover output gallery records | Local `/api/outputs` |
| Render an audio-reactive guide MP4 | Local `/api/audio/guide` HTTP route |
| Slice/loop uploaded audio | Local `/api/audio/slice` HTTP route |
| Prepare a captioning job folder | Local `/api/bfl_dashboard/v1/caption_agent` |

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

### Image Tool Edit

1. `GET /api/outputs`
2. Select an image URL/data URL.
3. `POST /api/bfl/tools`
   - `tool=erase` needs `image` and `mask`.
   - `tool=inpaint` needs `image`, `mask`, and `prompt`.
   - `tool=outpaint` needs `image`, `canvasWidth`, `canvasHeight`, and offsets.
4. `GET /api/outputs` to recover the edited result.

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

## Current Gaps

These are the main missing pieces for full UI/agent symmetry:

- **Binary audio export through stdio MCP:** `/api/audio/guide` and
  `/api/audio/slice` return media files, so they remain HTTP/UI workflows rather
  than JSON MCP wrapper tools.
- **Full live browser control:** the local MCP wrapper exposes server-side
  dashboard routes, but it does not drive the live React UI.
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
- [Official FLUX MCP repository](https://github.com/black-forest-labs/flux-mcp)
