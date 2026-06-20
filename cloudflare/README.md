# BFL Asset Archive Worker

Token-protected Cloudflare Worker for durable BFL outputs.

- R2 stores the generated PNG, `.prompt.txt`, and `.json` metadata under
  `BFL-API/outputs/YYYY-MM-DD/`.
- R2 also stores folder-style reference sets under
  `BFL-API/references/<collection-id>/`.
- D1 stores searchable metadata for the dashboard and agents.
- The local Next dashboard keeps the BFL API key local and syncs outputs here
  only when `BFL_ASSET_WORKER_URL` and `BFL_ASSET_WORKER_TOKEN` are configured.

## Setup

```bash
cd BFL/cloudflare
npm install
npm run r2:create
npm run d1:create
```

Paste the D1 `database_id` returned by Cloudflare into `wrangler.jsonc`.

```bash
cp .dev.vars.example .dev.vars
wrangler secret put BFL_ASSET_WORKER_TOKEN
npm run d1:migrate -- --remote
npm run deploy
```

For local Worker testing, `npm run dev` uses `.dev.vars`.

## Dashboard Env

Add this to `BFL/ui/.env.local`:

```bash
BFL_ASSET_WORKER_URL=https://bfl-api-assets.YOUR_SUBDOMAIN.workers.dev
BFL_ASSET_WORKER_TOKEN=replace-with-your-worker-token
```

After that, every successful local BFL generation is saved locally and uploaded
to R2/D1 automatically. `GET /api/outputs` merges remote archive rows with local
filesystem outputs.

The dashboard reads archived images back through the Worker and hydrates them as
data URLs, so any R2-backed output can be sent into the reference slots for a new
BFL prompt without exposing the bucket publicly.

Reference folders use the same token-protected Worker:

- `POST /api/references` uploads one source/reference image plus caption metadata.
- `GET /api/references?setId=<collection-id>` lists reference rows.
- `GET /api/references/<id>/image` streams the R2 image back for dashboard import.
