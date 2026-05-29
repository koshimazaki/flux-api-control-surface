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

The API routes read that server-side value when the UI field is blank. In a
deployed environment, use platform secrets instead of browser storage.

Completed generations are also written to:

`BFL/outputs/bfl-api-dashboard/YYYY-MM-DD/`

Each generation saves an image, `.prompt.txt`, and `.json` metadata file.

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
- `GET /api/outputs` hydrates saved filesystem outputs back into the gallery.

## MCP Note

BFL MCP is useful inside MCP clients such as Codex or Claude because it owns the
OAuth flow and tool calls. This browser UI uses BFL's HTTP API instead. Embedding
MCP directly would require a local or server-side MCP client/proxy that handles
OAuth. The dashboard API gives that proxy or an agent a clean way to read prompts,
plan batches, call the local BFL API route, and reuse the output library.
