# FLUX API Control Surface

Local workbench for exploring FLUX API workflows with prompt libraries,
reference images, FLUX image tools, output provenance, local asset recovery, and
agent-friendly routes.

This repo is local-first. It is safe to run as a developer tool, but it is not a
hosted public image generator. Keep paid FLUX execution on your machine through
env vars or macOS Keychain, and use the optional Cloudflare Worker only as a
token-protected archive for generated outputs.

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
- Run FLUX Erase, Inpaint/Fill, and Outpaint from saved gallery assets.
- Manage prompts, prompt combos, reference roles, costs, credits, and run logs.
- Save outputs as image, prompt text, JSON metadata, and PNG metadata.
- Recover local filesystem outputs and optional Cloudflare R2/D1 archive records.
- Vectorize saved images into SVG/PNG glyph assets.
- Prepare reference collections and captioning jobs for LoRA dataset workflows.
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
- **Local dashboard routes/MCP wrapper** for prompts, run plans, output recovery,
  glyph vectorization, reference archives, and artifacts that should appear in
  this repo's gallery.

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
- `experiments/` and `notes/`: retained analysis/reference material; review
  before linking from public release pages.

## Release Positioning

Use this framing:

> An open local control surface for exploring FLUX API workflows with prompt
> libraries, reference assets, image tools, output provenance, and agent-friendly
> local routes.

Do not frame it as a hosted generator or a broader closed creative-system
release.
