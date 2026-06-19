# FLUX API Control Surface

Local Next.js control surface for testing FLUX.2 prompts, batch permutations,
reference images, image tools, assets, costs, and logs.

This is a local development tool for now. It can become a public dev-tool demo
after a few more tested examples, a clean sample workflow, and a final secrets
scrub.

```bash
cd BFL/ui
npm install
npm run dev -- --port 3017
```

Open `http://localhost:3017`.

The MCP tab pairs the hosted FLUX MCP with local dashboard routes. Agents can
also read `GET /api/mcp/guide`; the repo guide is
[`../docs/mcp-agent-guide.md`](../docs/mcp-agent-guide.md).

For a real local MCP tool surface, run:

```bash
npm run mcp
```

and register it with Codex:

```bash
codex mcp add BFL_DASHBOARD --env BFL_DASHBOARD_URL=http://localhost:3017 -- node /absolute/path/to/BFL/ui/mcp/server.mjs
```

The gallery writes to the same localStorage key used by the AImedia library:
`nb2_generations`. It also mirrors records to `bfl-flower-assets` for export.
Large generated image data is stored in IndexedDB so localStorage only keeps
metadata.

The FLUX API key can be entered in the UI as a per-request override, but the
safer local paths are server-side config or macOS Keychain. The API routes never
return the raw key to the browser or MCP status APIs.

For `.env.local`:

```bash
BFL_API_KEY=...
```

For macOS Keychain, paste the key into the top bar and use the lock button. The
dashboard stores it as a generic password under the local service
`BFL Dashboard FLUX API Key`, clears the browser field, and later resolves it
server-side. `GET /api/bfl/key` reports only whether a key is configured.

Resolution order is: per-request `apiKey`, `BFL_API_KEY`, `FLUX_API_KEY`, then
macOS Keychain. Do not put `BFL_API_KEY` on an unprotected public deployment:
public callers could spend your credits. For demos, keep FLUX generation local
and only expose the token-protected R2/D1 archive Worker.

## Public Release Gate

Before opening or deploying this control surface as a showcase/resource:

- test it with several representative prompt batches and reference-image flows;
- add a small set of safe example prompts and generated screenshots;
- remove nonpublic prompts, output folders, account details, balances, and logs;
- keep `.env.local` local-only and document that users need their own
  `BFL_API_KEY` or a local Keychain item;
- prefer a local-first demo or token-protected archive over public server-side
  generation;
- present it as a developer workflow tool for FLUX API exploration, not as a
  hosted public image generator.

Completed generations are also written to:

`BFL/outputs/flux-api-control-surface/YYYY-MM-DD/`

Each generation saves an image, `.prompt.txt`, and `.json` metadata file.

## Optional R2 + D1 Archive

The safer demo shape is local generation plus remote archive storage. The local
control surface keeps the FLUX API key on your machine, then syncs successful outputs to
a token-protected Cloudflare Worker:

```bash
BFL_ASSET_WORKER_URL=https://bfl-api-assets.YOUR_SUBDOMAIN.workers.dev
BFL_ASSET_WORKER_TOKEN=...
```

The Worker stores images/prompts/metadata in `BFL-API/outputs/YYYY-MM-DD/` on R2
and writes searchable rows to D1. See `BFL/cloudflare/README.md` for bucket,
database, migration, and deploy steps. If those env vars are missing, the
control surface simply stays filesystem-only.

Archived R2 outputs are read back through the local server as data URLs, so
the existing "send image to references" button works for remote assets too.

The Run panel has an always-visible primary reference slot above `Generate`.
Paste a hosted image URL there, upload an image, or drop an image into the slot.
Hosted URLs are sent through as URLs; local drops are sent as data URLs for the
local FLUX generation route.

The Collections tab can also sync a folder-style reference set to the same
Worker under `BFL-API/references/<collection-id>/`. Use `Add folder`, then
`Sync refs` to upload source/reference images to R2/D1. `Import refs` pulls
those Cloudflare-hosted references back into the active collection, which makes
it easy to mix a fresh folder with an older dataset before exporting a LoRA ZIP.
The local HTML reference view is available at `/api/reference-archive?format=html`.

## Balance + Cost

- `POST /api/bfl/credits` calls BFL `GET /v1/credits`.
- `GET /api/bfl/key` reports local key status without returning the raw key;
  `POST` and `DELETE` store/remove the macOS Keychain item.
- `POST /api/bfl/generate` checks credits before and after a generation.
- If BFL returns submit-time `cost`, `input_mp`, or `output_mp`, those are saved
  on the asset and in the run log.
- The UI also shows prompt token approximation, output megapixels, and a
  minimum credit estimate before generation.

## Structure

- `app/page.tsx` mounts the control surface shell.
- `components/` contains the prompt library, editor, run panel, gallery, log,
  image tools, audio panel, and lightbox.
- `lib/dashboard/` contains focused hooks for prompt, asset, reference,
  balance, and training-collection state.
- `lib/provider-registry.ts` is the current FLUX/BFL model and tool source of
  truth. Add future provider lanes there first, then wire the matching
  API/client adapters.
- `lib/` contains prompt helpers, pricing estimates, shared types, and
  IndexedDB/localStorage persistence.

## Image Tool Workspaces

The workspace mode switcher exposes FLUX image tools on any gallery output:

- **Erase** (`flux-tools/erase-v1`): paint a mask directly on the image
  (white = remove, shift-drag unpaints), set mask dilation, run. No prompt.
- **Inpaint** (`flux-pro-1.0-fill`): paint a mask plus a replacement prompt.
- **Outpaint** (`flux-tools/outpainting-v1`): set target canvas size, optional
  pixel offsets (empty = centered), high/fast mode, optional experimental prompt.
- **Glyphs**: local SVG/PNG vectorization. The browser workspace can select a
  region visually, and agents can call `/api/glyphs/vectorize` for saved outputs.

Tool results land in the gallery with `sourceAssetId`/`operation` provenance and
the same local + R2 archive treatment as generations.

## Prompt Library + Asset References

- The audio panel's `Save to library` stores the generated sequence prompt under
  the `Audio Sequences` library; gallery cards can save their prompt under
  `Gallery Prompts`.
- Gallery cards are draggable onto audio timing rows and the reference dropzone.
- Cards used as `@imgN` in the audio timeline or as reference slots get badge
  chips and a highlight, so you can see which assets the current prompt uses.

## Agent API

The UI is also an agent/MCP-facing local API:

- `GET /api/dashboard/context` returns routes, models, prompts, output metadata,
  and auth expectations.
- `GET /api/bfl/key` reports whether paid execution can resolve a key from env
  or macOS Keychain, without returning the raw key.
- `POST /api/dashboard/run-plan` turns prompt IDs or a prompt queue into concrete
  `/api/bfl/generate` request bodies with token/cost estimates.
- `POST /api/dashboard/batch` dry-runs or executes a control-surface batch. Execution
  calls the local BFL route and saves image/prompt/metadata files.
- `POST /api/bfl/tools` runs erase/inpaint/outpaint on an existing image with the
  same output persistence and provenance as generations.
- `GET /api/mcp/manifest` describes the complete local route surface plus native
  FLUX MCP handoff options.
- `GET /api/outputs` hydrates saved filesystem outputs and, when configured,
  archived R2/D1 outputs back into the gallery.
- `GET /api/reference-archive` hydrates Cloudflare reference folders back into
  the collection builder; `POST /api/reference-archive` syncs collection images.

## MCP Note

BFL MCP is useful inside MCP clients such as Codex or Claude because it owns the
OAuth flow and tool calls. This browser UI uses BFL's HTTP API instead. Embedding
MCP directly would require a local or server-side MCP client/proxy that handles
OAuth. The control-surface API gives that proxy or an agent a clean way to read prompts,
plan batches, call the local BFL API route, and reuse the output library.
