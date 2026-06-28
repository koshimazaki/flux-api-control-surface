# Control Surface Guide

This guide expands the short README without turning the repo landing page into a
manual.

## Architecture

The app is a local Next.js workbench. Browser UI state handles editing,
selection, masks, local imports, and review. Server routes handle paid FLUX API
calls, output persistence, local filesystem recovery, optional Cloudflare sync,
and agent-readable manifests.

The current surface is BFL/FLUX, and that is intentional for the public
repo. `ui/lib/provider-registry.ts` is a BFL model/tool table, not a broad
provider platform. Keep new work BFL-specific unless there is a concrete local
workflow that needs another adapter.

## Local App

```bash
cd ui
npm install
npm run dev -- --port 3017
```

The main screen includes:

- prompt library and prompt editor;
- run panel with model, dimensions, batch mode, reference roles, and estimates;
- asset gallery with favorites, metadata, reference sending, and downloads;
- image tools for Erase, Virtual Try-On, Outpaint, Deblur, and Glyphs;
- audio/script workflow for analysis-driven prompt composition;
- MCP/API panel with local route guidance.

## Key And Secret Handling

The recommended local UX is macOS Keychain:

1. Paste the FLUX key into the top bar.
2. Press Enter or the lock button.
3. Confirm the browser prompt.
4. The server stores the key in Keychain and clears the browser field.

Paid calls resolve keys in this order:

1. explicit request key;
2. `BFL_API_KEY`;
3. `FLUX_API_KEY`;
4. macOS Keychain.

The status route reports only configured/missing/source metadata:

```bash
curl http://localhost:3017/api/bfl/key
```

It never returns the raw key. Write/delete operations are limited to the same
local dashboard origin.

## Core Routes

- `GET /api/dashboard/context`: route map, prompt/output summaries, auth notes.
- `POST /api/dashboard/run-plan`: turn prompts into concrete generation bodies.
- `POST /api/dashboard/batch`: dry-run or execute batch plans.
- `POST /api/bfl/generate`: generate one saved FLUX output.
- `POST /api/bfl/tools`: erase, virtual try-on, outpaint, or deblur an existing image.
- `POST /api/bfl/credits`: check BFL credits through the resolved local key.
- `GET /api/outputs`: recover filesystem and optional R2/D1 outputs.
- `GET /api/mcp/guide`: agent-readable MCP guide.
- `GET /api/mcp/manifest`: local route manifest.
- `POST /api/glyphs/vectorize`: create SVG/PNG glyph outputs.
- `GET/POST /api/reference-archive`: import or sync reference collections.
- `POST /api/finetune/dataset`: export a FLUX.2 [klein] LoRA dataset with
  captions and AI-Toolkit config.
- `GET/POST/DELETE /api/finetunes`: list, register, or remove hosted BFL
  finetune IDs for local generation.
- `POST /api/audio/guide` and `POST /api/audio/slice`: render audio guide assets
  when the caller already has analysis/marker data.

## Official FLUX MCP Pairing

Use the official hosted FLUX MCP for direct BFL account operations:

```bash
codex mcp add FLUX --url https://mcp.bfl.ai
codex mcp login FLUX
```

Use local dashboard routes when outputs should land in the local gallery,
prompt library, reference collection, or output archive.

For MCP clients that need local tools rather than route discovery:

```bash
cd ui
BFL_DASHBOARD_URL=http://localhost:3017 npm run mcp
```

The local wrapper covers the JSON dashboard workflows: manifest/context, key
status, credits, prompt list/save/delete, run plans, batch execution, saved
generation, image tools, reference archive list/sync, glyph vectorization, and
caption job prep, plus finetune dataset export, registry, and generation.
Audio guide/slice routes return binary media and remain HTTP/UI workflows for
now.

## Optional Cloudflare Archive

The Worker in `cloudflare/` accepts successful local outputs and stores:

- image bytes in R2 under `BFL-API/outputs/YYYY-MM-DD/`;
- prompt text;
- metadata JSON;
- searchable D1 rows;
- reference collection records.

Set these in `ui/.env.local` to enable sync:

```bash
BFL_ASSET_WORKER_URL=https://bfl-api-assets.YOUR_SUBDOMAIN.workers.dev
BFL_ASSET_WORKER_TOKEN=replace-with-your-worker-token
```

If they are missing, nothing remote happens.

## Analysis And Workflow Notes

The repo includes public-safe analysis notes for asset workbench direction, MCP
agent workflows, and audio-reactive experiments. Keep those as references, not
as the README surface. Before a public tag, check any `notes/` or `experiments/`
links for internal context and generated asset filenames.

## Extending The Workbench

Recommended next extension points:

- promote prompts to first-class assets;
- add asset filters for image, prompt, glyph, mask, audio, and video records;
- add live event refresh for agent-created outputs;
- add a small BFL job manifest only if it reduces duplicated batch/tool code;
- keep secret storage local and server-side.
