# BFL API parity — 23 October 2026

Verified with the live [OpenAPI schema](https://api.bfl.ai/openapi.json),
[Image API reference](https://docs.bfl.ai/api-reference/utility/generate-an-image-with-flux-3),
and [Upscale API reference](https://docs.bfl.ai/api-reference/models/upscale-a-video-with-flux-3).
The local watcher recorded standard Image width/height and `match_input` on 22 October.

- Standard Image: paired exact width/height, 256–6256 per side; at most
  16822272 pixels without references or 4194304 with references. These override
  resolution and aspect ratio. Boxed edits/layouts require the authored frame aspect.
- Standard Image: `1.5k`, edits-only `match_input`, explicit `version: latest`,
  and filtering levels 0–7 (subject to organization approval). Unknown pricing
  stays unknown for exact sizes and unpriced tiers.
- Video Upscale: at most 3686400 input pixels (2560×1440 equivalent); output
  capped by the provider at 13.75 MP rather than rejected locally. The displayed
  output dimensions are approximate; actual provider rounding can differ.
  Estimates cap both output area and duration at 20 seconds.
- Upscale filtering levels 0–7 follow the provider contract and organization approval.
  The dashboard keeps its conservative existing duration allowance below 20.5 seconds;
  the endpoint processes only the first 20 seconds. The pricing guide's older
  reject-all-over-20 wording conflicts with the endpoint; the endpoint governs here.
- API adapters, controls, local MCP descriptions/schema, CLI-shared builders,
  discovery manifest and agent documentation follow these changes.

The opaque `user` ID change is independently covered by existing draft PR #11.
Webhook fields remain outside the dashboard's polling-based workflow.
Klein retains its separate 64-pixel minimum and existing API contract.

Validation uses mocked provider calls and local tests; no paid generations.
