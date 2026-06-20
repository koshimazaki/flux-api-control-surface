# Public Release Checklist

Use this before tagging, publishing, or opening the repo more broadly.

## Required Checks

- `cd ui && npm test`
- `cd ui && npm run lint`
- `cd ui && npm run build`
- Open the dashboard locally and verify `/api/bfl/key`, `/api/mcp/status`, and
  `/api/outputs` return without exposing secrets.
- Smoke-test at least one prompt save, one output recovery, and one image-tool
  workflow with a nonprivate sample.

## Secret And Privacy Sweep

- No real `.env`, `.env.local`, `.dev.vars`, API key, OAuth token, Worker token,
  private key, or account id is tracked.
- No generated output metadata includes account balances, private filesystem
  paths, local usernames, client names, or nonpublic prompt material.
- Prompt libraries in `configs/` are curated public examples for tutorials and
  smoke tests, not private or client-specific prompt sets.
- Generated media stays ignored unless a sample is deliberately curated.
- `notes/` and `experiments/` are reviewed before linking from the README.
- Cloudflare examples use placeholders only.

## Public Framing

Say:

> Local control surface for FLUX API workflows, prompt libraries, reference
> assets, image tools, output provenance, and agent-friendly routes.

Avoid:

- hosted generator claims;
- broader closed-system roadmap claims;
- provider support claims that are not implemented;
- implying bundled keys, credits, accounts, or generated sample rights.

## Known Nonblocking Warnings

The current UI lint run reports existing warnings in audio-script components:

- missing `alt` on one image preview;
- hook dependency warnings in the audio-script cache;
- one stale eslint-disable comment.

These should be cleaned up, but they are not secret or release-blocking issues.
