# BFL API Dashboard

Local Next.js dashboard for testing BFL FLUX.2 prompts, batch permutations,
reference images, assets, costs, and logs.

```bash
cd BFL/ui
npm install
npm run dev -- --port 3017
```

Open `http://localhost:3017`.

The gallery writes to the same localStorage key used by the AImedia library:
`nb2_generations`. It also mirrors records to `bfl-flower-assets` for export.
Large generated image data is stored in IndexedDB so localStorage only keeps
metadata.

The BFL API key can be entered in the UI, but the safer local path is
`BFL/ui/.env.local`:

```bash
BFL_API_KEY=...
```

The API routes read that server-side value when the UI field is blank. Do not
put `BFL_API_KEY` on an unprotected public deployment: public callers could
spend your credits. For demos, keep BFL generation local and only expose the
token-protected R2/D1 archive Worker.

Completed generations are also written to:

`BFL/outputs/bfl-api-dashboard/YYYY-MM-DD/`

Each generation saves an image, `.prompt.txt`, and `.json` metadata file.

## Optional R2 + D1 Archive

The safer demo shape is local generation plus remote archive storage. The local
dashboard keeps the BFL API key on your machine, then syncs successful outputs to
a token-protected Cloudflare Worker:

```bash
BFL_ASSET_WORKER_URL=https://bfl-api-assets.YOUR_SUBDOMAIN.workers.dev
BFL_ASSET_WORKER_TOKEN=...
```

The Worker stores images/prompts/metadata in `BFL-API/outputs/YYYY-MM-DD/` on R2
and writes searchable rows to D1. See `BFL/cloudflare/README.md` for bucket,
database, migration, and deploy steps. If those env vars are missing, the
dashboard simply stays filesystem-only.

Archived R2 outputs are read back through the dashboard server as data URLs, so
the existing "send image to references" button works for remote assets too.

## Balance + Cost

- `POST /api/bfl/credits` calls BFL `GET /v1/credits`.
- `POST /api/bfl/generate` checks credits before and after a generation.
- If BFL returns submit-time `cost`, `input_mp`, or `output_mp`, those are saved
  on the asset and in the run log.
- The UI also shows prompt token approximation, output megapixels, and a
  minimum credit estimate before generation.

## Structure

- `app/page.tsx` coordinates state and API calls.
- `components/` contains the prompt library, editor, run panel, gallery, log,
  and lightbox.
- `lib/` contains prompt helpers, pricing estimates, shared types, and
  IndexedDB/localStorage persistence.

## Agent API

The UI is also an agent/MCP-facing local API:

- `GET /api/dashboard/context` returns routes, models, prompts, output metadata,
  and auth expectations.
- `POST /api/dashboard/run-plan` turns prompt IDs or a prompt queue into concrete
  `/api/bfl/generate` request bodies with token/cost estimates.
- `POST /api/dashboard/batch` dry-runs or executes a dashboard batch. Execution
  calls the local BFL route and saves image/prompt/metadata files.
- `GET /api/mcp/manifest` describes the complete local route surface plus native
  FLUX MCP handoff options.
- `GET /api/outputs` hydrates saved filesystem outputs and, when configured,
  archived R2/D1 outputs back into the gallery.

## MCP Note

BFL MCP is useful inside MCP clients such as Codex or Claude because it owns the
OAuth flow and tool calls. This browser UI uses BFL's HTTP API instead. Embedding
MCP directly would require a local or server-side MCP client/proxy that handles
OAuth. The dashboard API gives that proxy or an agent a clean way to read prompts,
plan batches, call the local BFL API route, and reuse the output library.
