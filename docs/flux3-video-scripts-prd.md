# FLUX.3 Video Scripts — Product Requirements

Status: reviewed and approved for implementation. This PRD records the August
2026 product decisions for video prompt libraries, collection-driven keyframe
permutations, and the universal dashboard generation queue.

## Product Direction

FLUX.3 Video should feel like a native extension of the existing BFL control
surface, not a separate application. It gets a dedicated video-oriented prompt
and scripting experience while continuing to share prompts, collections,
assets, generation history, API-key resolution, and MCP conventions with the
image workbench.

The dashboard has one global generation queue. Image generation, VTO, Erase,
Outpaint, Deblur, FLUX.3 video, and draft enhancement all enter that queue and
remain visible together. Different job types may execute in parallel through
internal lanes, but users should not have to manage separate queues.

The delivery sequence is capture-first: every saved generation becomes a
machine-readable experiment record automatically, the dashboard evaluates those
records, and the local MCP and CLI expose the same API to Codex and other agents.
The browser, MCP, and CLI are clients of one control-surface contract; none owns
an independent generation history or provider executor.

## Confirmed FLUX.3 Constraints

- The upstream endpoint is `POST https://api.bfl.ai/v1/flux-3-video`.
- Image-to-video accepts one to ten keyframes. Four-image operation is familiar
  from internal/Discord use, but it is not treated as a public API constraint.
- One image starts the video; two define start and end; three or more untimed
  images are distributed evenly and require a fixed duration.
- Explicitly timed keyframes use `[seconds, image]` pairs.
- Image-to-video and text-to-video support 5–20 seconds.
- Public FLUX.3 preview documentation is inconsistent about video continuation:
  one surface says 5–15 seconds and another says 5–20. The dashboard validates
  v2v conservatively at 5–15 until the live schema and docs agree, and keeps the
  constraint isolated so it can change without a data migration.
- Supported aspect ratios are 21:9, 2:1, 16:9, 4:3, 1:1, 3:4, and 9:16.
- Resolution is expressed as `hd` or `fhd`; exact dimensions follow the aspect
  ratio. Drafts render in `hd`.
- Requests with conditioning media use safety tolerance 0–2.
- Current pricing is $0.06/s for t2v/i2v drafts, $0.17/s for HD, and $0.29/s
  for FHD. Video continuation is $0.12/s draft, $0.43/s HD, and $0.54/s FHD.
- Delivery URLs are ephemeral and must be downloaded immediately. Current image
  integration guidance says about 10 minutes, while FLUX.3 video guidance says
  signed video results last about two hours; neither is durable storage.
- The API's only image inputs are timeline media: `keyframes`, `start_video`,
  and `draft_cache`. There is no reference/style-role image field yet, but BFL
  has announced "Omni Reference" and video generation from image, video, and
  audio reference combinations as upcoming. Keep Video Script slot contracts
  role-extensible so reference-role media can be added without a data
  migration when that ships — and note audio references directly serve the
  audio-authored workflow.

## Goals

1. Add a logical Video Prompt Library without duplicating prompt storage.
2. Add Image and Video sub-tabs to the existing Script surface.
3. Build editable rows of FLUX.3 keyframes from assets, folders, and Collections.
4. Generate repeatable image and prompt permutation plans with cost-safe limits.
5. Send planned jobs into one persistent global generation queue.
6. Expose the same workflows through the existing local API v1 contract and MCP
   wrapper style.
7. Preserve provenance from prompt and source collection through final video.
8. Automatically capture prompts, sanitized request JSON, lifecycle timings,
   provider cost, local outputs, and evaluation annotations for model comparison.

## Capture And Model Evaluation

Every successfully saved image, image-tool output, and FLUX.3 video produces a
normalized `bfl-evaluation/v1` record derived from the canonical output metadata.
Capture is automatic and does not depend on a user opening the Run Log.

Each record includes:

- provider request ID, model, endpoint, operation, and media type;
- complete prompt text plus prompt-library source IDs when available;
- sanitized settings JSON without API keys, full base64 media, or auth tokens;
- request, submission, provider generation, download, and total timings;
- submitted provider cost, observed credit delta, and balance snapshots;
- local preview/output and metadata paths;
- source asset, Collection, keyframe, row, and batch provenance when available;
- a 1–5 rating, keep/maybe/reject verdict, tags, notes, and review timestamp.

The Runs surface contains a persistent Model Evaluation view alongside the
browser-session log. It filters by Image/Video, model, verdict, and search;
previews image and video outputs; and exports the filtered records as JSON or
JSONL. Evaluation annotations are written atomically as a small sidecar so
reviewing an output never rewrites or invalidates its original metadata.

Older saved outputs remain visible with whatever data can be reconstructed.
New queue attempts later add failure, retry, waiting, and recovery timing to the
same versioned read model rather than introducing a second history system.

## Non-Goals

- Replacing the current image Script workflow.
- Creating a second prompt database for video.
- Introducing a local API v2 or renaming existing MCP tools.
- Depending on the hosted BFL MCP for local queue or artifact persistence.
- Automatically launching an unbounded Cartesian batch.

## Prompt Library Requirements

Prompt records use one shared persistence model with optional media metadata.
Existing records remain valid when the new fields are absent.

The Prompt Library menu groups records into:

- Image Prompts
- Video — Simple
- Video — Detailed
- Video — Beat / Sequence
- Video — Dialogue & Sound
- Shared Prompts

A video prompt can store a final compiled prompt plus optional structured
sections for setup, temporal beats, camera, dialogue, sound, and ambience.
Saving the prompt from a FLUX.3 asset defaults to the Video library. Shared
prompts may be selected in both image and video workflows.

Video prompt assignment supports:

- one prompt for every image row;
- zip prompts to rows;
- rotate prompts through rows;
- combine selected prompts into one prompt;
- explicit Cartesian expansion of image rows by prompt variants.

The UI must show the final job equation before submission, for example
`12 image rows × 3 prompts = 36 jobs`. The preview shows the full chain live —
raw expansion → unique rows after dedup → capped jobs → estimated cost at
current per-second pricing — and it updates as pools, modes, prompts, or
duration change.

## Video Script Requirements

The existing Script tab gains Image and Video sub-tabs. The Video surface has a
source browser, keyframe matrix, prompt assignment, shared settings, and batch
preview.

### Source Browser

- Load existing Asset Collections.
- Import a directory as a temporary or saved Collection.
- Filter collection members to valid image inputs.
- Drag one asset into one slot.
- Drag a Collection into a slot pool or into the general permutation pool.
- Reuse the VTO drag/drop affordance through a generic image-slot component;
  do not reuse garment-specific state.

### Keyframe Matrix

- One row equals one FLUX.3 image-to-video job.
- Four keyframe slots are visible by default for familiar, compact ergonomics.
- Rows can expand to the API maximum of ten slots.
- Users can add, duplicate, delete, and reorder rows.
- Images can be reordered or swapped within a row.
- Each slot can be manual, pinned, or backed by an image pool.
- Auto-generated rows remain manually editable.

Matrix interaction rules:

- Dropping a Collection or pool onto a slot column header binds that position
  to the pool for generation. Dropping an image onto a single cell overrides
  only that row's slot. The two drop targets look and highlight differently so
  authoring a batch and editing one row are never the same ambiguous gesture.
- Rows record whether they are generator output or hand-edited. Hand-edited
  rows show an edited badge, and regenerating replaces or removes only
  unedited rows; edited rows are preserved unless explicitly discarded.

### Image Expansion Modes

- Manual rows
- Choose combinations of N images
- Ordered permutations
- Rotate selected positions
- Keep first or last N positions fixed
- Vary first, last, or selected positions
- Zip pools by index
- Cartesian slot pools
- Repeatable random sampling with a visible planner seed

The UI presents these as two generator workflows rather than a flat mode list:

- **Sequence from one pool** — one pool fills all keyframe positions using
  combinations, ordered arrangements, or rotations (morph-chain batches).
- **Per-slot pools** — each slot is pinned or varying, and one strategy toggle
  combines the varying slots: Cartesian, zip by index, or seeded sample.

Fixed, vary, and rotate position behaviors fall out of per-slot pin/vary flags
instead of appearing as separate menu entries; the full expansion list above
remains available as planner-engine capabilities.

The planner seed controls only row/prompt selection and ordering. FLUX.3 does
not expose an upstream generation seed, so UI copy must not promise identical
fresh renders. Draft enhancement is the provider-supported way to reproduce an
accepted draft. The planner deduplicates identical rows, previews the result
count, and applies a configurable hard cap before enqueueing.

### Timing And Settings

Rows support evenly spaced keyframes and explicit timestamps. Default Video
Script settings are:

- `hd` resolution (the API's roughly 720p class);
- 8 seconds, with quick presets for 5, 8, 10, and 20 seconds;
- 16:9;
- synchronized audio enabled;
- draft-first enabled;
- safety tolerance 2.

Global settings may be overridden per row. Validation prevents invalid
durations, timestamps, media counts, or conditioned safety values.

The Audio Script workflow can import beat, transition, or locked-marker times
as FLUX.3 keyframe timestamps. This is a first-class Video Script input, not a
later export-only bridge.

Timed batches use a batch-level timing template: one timestamp pattern,
typically imported from audio markers, applies to every row so a batch reads
as one audio timeline driving many visual permutations. Individual rows may
override the template through a per-row timeline editor rather than raw
per-cell numbers.

## Universal Queue Requirements

All paid generation entry points enqueue a typed job. The queue includes image,
tool, and video work in one visible order.

The authoritative queue runner is server-side. A browser tab is a controller
and observer, not the process required to keep jobs moving. MCP-enqueued work
must run with no dashboard tab open, refresh must not orphan provider work, and
multiple tabs or processes must not double-submit a job.

Required lifecycle:

`Queued → Waiting → Submitting → Generating → Downloading → Complete / Failed`

Required behavior:

- configurable global concurrency;
- internal image/tool/video lane limits;
- long video polling must not block available image capacity;
- dependency links such as image generation → FLUX.3 keyframe → video;
- pause/resume, reorder, retry, cancel, and clear-settled controls;
- persistence across browser refreshes;
- recovery from saved BFL request IDs and polling URLs;
- a file-backed queue store with atomic writes and a renewable single-runner
  lease;
- separate submit, poll-step, and finalize/download provider phases so a web
  request timeout cannot erase an accepted BFL job;
- bounded exponential backoff for HTTP 429, 5xx, and transient network errors;
- terminal handling for moderation, invalid input, and insufficient credits;
- automatic queue pause on insufficient credits and source quarantine when the
  same bad input would otherwise fail an entire permutation batch;
- immediate local download of expiring BFL result URLs;
- cost estimates per job and for the full queue;
- reconciliation of estimates against the actual `cost` returned by BFL.

The initial scheduler should be conservative even though BFL currently
documents up to 24 concurrent requests for most endpoints. Provider limits are
not hard-coded as product truth; lane limits are configurable and adapt to 429s.

## Assets And Provenance

The shared Assets library already filters All, Images, Videos, and Collections.
This project additionally requires:

- a visible `FLUX.3` badge on FLUX.3 generations;
- an optional FLUX.3 source filter;
- `Use in Video Script` actions for image assets and Collections;
- batch ID, row ID, prompt IDs, collection IDs, keyframe asset IDs, and timing
  saved with each video;
- video cards and lightbox playback using the existing shared media library.

## API And MCP Compatibility

No v2 is introduced.

- Upstream BFL calls continue through `https://api.bfl.ai/v1`.
- Provider execution remains under `/api/bfl/*`.
- Planning and orchestration remain under `/api/dashboard/*`.
- The stable local agent contract remains discoverable through
  `/api/bfl_dashboard/v1/manifest`.
- Existing request shapes and MCP tools remain backward compatible.

Queue HTTP operations follow the existing single-route CRUD style:

- `GET /api/dashboard/queue`
- `POST /api/dashboard/queue`
- `PATCH /api/dashboard/queue`
- `DELETE /api/dashboard/queue?id=<jobId>`

MCP adds flat snake_case tools consistent with the existing wrapper:

- `list_generation_queue`
- `enqueue_generation_jobs`
- `update_generation_job`
- `cancel_generation_job`
- `list_evaluations`
- `update_evaluation`

The local agent surface also includes a thin `npm run --silent cli -- ...`
client. It
calls the same local HTTP routes as the UI and MCP, accepts request JSON from a
file or stdin, emits machine-readable JSON/JSONL, and adds no provider logic of
its own. Initial commands cover context, assets, evaluations, evaluation
updates, dry-run planning, batch calls, image generation, image tools, and
FLUX.3 video generation.

Existing `generate_saved_image`, `run_image_tool`, and `generate_flux3_video`
remain available. They may enqueue internally and wait by default so their
observable response behavior does not break.

`/api/dashboard/batch` becomes a compatibility wrapper over the authoritative
queue. It may enqueue-and-wait to preserve its response, but it must not remain
a second independent sequential executor.

## Acceptance Criteria

1. A user can load a Collection, pin two slots, vary the remaining slots, edit
   the generated rows, and enqueue the selected rows.
2. Four slots appear by default and a row can expand to ten valid keyframes.
3. A user can apply one video prompt, rotate several prompts, or explicitly
   create the image-row × prompt Cartesian product.
4. The plan preview shows job count, settings, estimated cost, and validation
   errors before paid execution.
5. Image, VTO/tool, and video jobs appear together and run in parallel within
   global and lane limits.
6. A video job can wait on an image job and consume its output automatically.
7. Queue state survives refresh/server restart, and an accepted provider job
   resumes from its saved request ID and polling URL.
8. The local MCP can plan, enqueue, inspect, and control the same server-run
   queue without an open browser tab.
9. Completed videos appear in Assets with Video and FLUX.3 identification plus
   complete batch/keyframe provenance.
10. A final paid smoke test successfully submits ten keyframes in one 5-second
    HD draft without exceeding the planned cost guardrail.
11. Audio beat or transition markers can populate timed keyframes in a Video
    Script row.
12. A completed generation appears automatically in Model Evaluation with its
    prompt, sanitized settings, timing, cost, and local output, and can be rated
    once from the UI, MCP, or CLI with the same saved result.
13. A Codex agent can submit image/video/tool JSON through the CLI and read the
    resulting normalized JSON without browser automation.
