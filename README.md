
# FLUX API Control Surface

Local workbench for FLUX.2 image and FLUX 3 Video workflows: prompt libraries,
reference images, FLUX image tools, video scripting with keyframe permutations,
a server-owned generation queue, model evaluation records, output provenance,
local asset recovery, and agent-friendly routes.

This repo is local-first. It is safe to run as a developer tool, it is not a
hosted public image generator. Keep paid FLUX execution on your machine through
env vars or macOS Keychain, and use the optional Cloudflare Worker only as a
token-protected archive for generated outputs.

<div align="center">
  <video src="https://github.com/user-attachments/assets/e7c7d7e0-940a-4fd6-983b-cc79165b4aba" width="640" autoplay loop muted></video>
  <em>FLUX 3 Video Upscale and UI themes </em>
</div>

## Quick Start

```bash
cd ui
npm install
npm run dev -- --port 3017
```

Open `http://localhost:3017`.

Run checks:

```bash
cd ui
npm test
npm run lint
npm run build
```

## What It Does

- Generate FLUX.2 images through local Next.js API routes.
- Generate FLUX 3 Video: text-to-video, one to ten ordered or explicitly timed
  keyframes, video continuation, synchronized audio, and deterministic
  draft-to-1080p enhancement.
- Plan Video Script batches: collection-driven keyframe permutations, prompt
  assignment modes, batch timing templates imported from audio markers, and a
  live job-count/cost preview before any paid run.
- Run every paid job through one server-owned generation queue with image, tool,
  and video lanes, pause/retry/cancel, restart recovery from saved provider
  request IDs, and estimated-versus-actual cost reconciliation.
- Capture each run as a normalized evaluation record with prompts, settings,
  timings, and cost; rate, tag, and export JSON/JSONL from the Evaluate tab,
  the CLI, or MCP.
- Run FLUX Erase, Virtual Try-On, Outpaint, and Deblur from saved gallery assets.
- Manage prompts, prompt combos, reference roles, costs, credits, and run logs.
- Save outputs as image, prompt text, JSON metadata, and PNG metadata.
- Recover local filesystem outputs and optional Cloudflare R2/D1 archive records.
- Vectorize saved images into SVG/PNG glyph assets.
- Prepare reference collections, caption jobs, LoRA datasets, and finetune runs.
- Expose local HTTP/MCP-compatible routes for agents.

## Key Handling

The UI never returns a raw provider key from status or MCP routes.

Resolution order for paid local API calls:

1. Per-request `apiKey` override.
2. `BFL_API_KEY`.
3. `FLUX_API_KEY`.
4. macOS Keychain item saved by the top-bar lock button.

Use `.env.example` or `ui/.env.local.example` as placeholders only. Do not commit
real `.env`, `.env.local`, Worker tokens, output metadata with account details,
or generated media unless deliberately curated as a public sample.

## MCP And Agents

There are two complementary surfaces:

- **Official FLUX MCP** at `https://mcp.bfl.ai` for BFL-hosted OAuth, direct
  generation, edits, history, and account operations.
- **Local dashboard routes/MCP wrapper** for prompts, run plans, generation
  queue control, evaluation records, output recovery, glyph vectorization,
  reference archives, and artifacts that should appear in this repo's gallery.

Hosted FLUX MCP setup:

```bash
codex mcp add FLUX --url https://mcp.bfl.ai
codex mcp login FLUX
```

Local dashboard MCP wrapper:

```bash
cd ui
BFL_DASHBOARD_URL=http://localhost:3017 npm run mcp
```

See [MCP And Agent Guide](./docs/mcp-agent-guide.md).

## Optional Archive

The Cloudflare Worker stores generated images, prompts, and metadata in R2 and
searchable D1 rows. Configure it only when you want a durable remote archive:

- [Cloudflare Worker README](./cloudflare/README.md)
- `BFL_ASSET_WORKER_URL`
- `BFL_ASSET_WORKER_TOKEN`

Without those env vars, the UI stays filesystem/localStorage/IndexedDB only.

## Docs

- [Control Surface Guide](./docs/control-surface-guide.md): expanded setup,
  features, local routes, security posture, and release notes.
- [MCP And Agent Guide](./docs/mcp-agent-guide.md): official FLUX MCP plus local
  dashboard API usage.
- [FLUX 3 Video Scripts PRD](./docs/flux3-video-scripts-prd.md): product
  requirements for video prompts, keyframe permutations, and the universal
  generation queue, with API constraints verified against the live BFL docs.
- [FLUX 3 Implementation Plan](./docs/flux3-video-scripts-implementation.md):
  queue architecture, provider lifecycle split, failure taxonomy, and phasing.
- [Asset Workbench Readiness](./docs/asset-workbench-readiness.md): BFL asset
  workflow direction.
- [Public Release Checklist](./docs/public-release-checklist.md): what to verify
  before tagging or publishing.
- [UI README](./ui/README.md): detailed Next.js app notes.

## Repo Map

- `ui/`: Next.js dashboard, route handlers, local MCP wrapper, tests.
- `cloudflare/`: optional token-protected R2/D1 archive Worker.
- `pipeline/`: Python prompt and generation helpers.
- `configs/`: public-safe sample prompt plans kept as tutorials and smoke-test
  fixtures, not a private prompt library.
- `docs/`: public-facing implementation and release notes.
- `experiments/` and `notes/`: local-only working material, intentionally not
  tracked in the public repo.

## License

[MIT](./LICENSE). Copyright (c) 2026 Koshi (koshimazaki).

You may use, adapt, and redistribute this code, including commercially, as long
as the copyright notice and permission notice travel with it.

Two things the licence does not cover, because they are not mine to grant:

- The FLUX models and the BFL API itself — those are governed by Black Forest
  Labs' own terms, and you need your own API key.
- The BFL brand mark and the webfonts referenced from `bfl.ai` in
  `ui/app/styles/fonts.css` and `ui/components/top-bar.tsx`. They are hotlinked
  third-party assets, not part of this work. Self-host your own before shipping
  anything derived from this.
