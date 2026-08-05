# FLUX.3 Video Scripts — Implementation Plan

Status: architecture amended after review. Phase 1 delivered a tested queue
model foundation only; it is not yet the live scheduler. The capture/evaluation
slice is now implemented over canonical saved metadata, including UI, MCP, and
CLI readers. Phase 2 must still establish the resumable server-side substrate
before any existing entry point migrates.

Product requirements: [flux3-video-scripts-prd.md](./flux3-video-scripts-prd.md)

## Existing Baseline

The repository already has:

- a browser image queue in `ui/lib/generation-queue.ts` and
  `ui/lib/use-dashboard-state.ts`;
- image run planning through `/api/dashboard/run-plan` and execution through
  `/api/bfl/generate`;
- VTO, Erase, Outpaint, and Deblur through `/api/bfl/tools`;
- FLUX.3 single generation and local persistence through
  `/api/bfl/flux3-video`;
- shared image/video Assets filtering and video playback;
- prompt combinations and pair permutations;
- server-backed Asset Collections;
- a local stdio MCP wrapper and `/api/bfl_dashboard/v1/manifest`.
- automatic successful-run timing capture plus a normalized
  `bfl-evaluation/v1` read model, persistent evaluation UI, MCP tools, and thin
  CLI over `/api/evaluations`.

At project start, the queue was image-only, browser-memory-only, and modeled only
queued, running, complete, and failed states. Phase 1 generalized that foundation
at the type/helper level before new Video Script UI is added.

The production path is still the old browser runner in
`ui/lib/use-dashboard-state.ts`. It does not call the lane-aware selector and it
does not exercise priority, dependencies, retry timing, or the expanded provider
lifecycle. Similarly, `/api/bfl/generate`, `/api/bfl/tools`, and
`/api/bfl/flux3-video` still submit, poll, download, and save inside one blocking
request. `/api/dashboard/batch` remains a second sequential executor.

These are explicit migration facts, not completed queue behavior.

## Architecture Rules

1. Use one queue model and scheduler for image, tool, and video jobs.
2. Keep one visible global order, with execution lanes underneath.
3. Separate planning from paid execution.
4. Store asset IDs and collection IDs in plans; resolve media server-side when
   executing to avoid large duplicated browser payloads.
5. Persist enough upstream state to recover polling and downloads after refresh.
6. Preserve all existing HTTP and MCP request contracts.
7. Keep provider-specific execution under `/api/bfl/*` and orchestration under
   `/api/dashboard/*`.
8. The server owns queue execution. Browsers and MCP clients only enqueue,
   inspect, and control work.
9. Persist the accepted provider request before polling so an HTTP timeout or
   process restart cannot erase recoverable BFL work.
10. Treat saved generation metadata as the canonical experiment source. UI,
    MCP, and CLI consume one versioned evaluation read model and never create
    parallel provider executors or histories.

## Core Data Contracts

```ts
type GenerationJobKind = "image" | "tool" | "video";
type GenerationLane = "image" | "tool" | "video";
type GenerationStatus =
  | "queued"
  | "waiting"
  | "paused"
  | "submitting"
  | "running"
  | "downloading"
  | "complete"
  | "failed"
  | "cancelled";

type GenerationQueueJob = {
  id: string;
  kind: GenerationJobKind;
  lane: GenerationLane;
  operation: string;
  title: string;
  status: GenerationStatus;
  createdAt: number;
  priority: number;
  dependsOn?: string[];
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  estimatedCredits?: number;
  estimatedUsd?: number;
  providerRequestId?: string;
  pollingUrl?: string;
  resultAssetId?: string;
  failureClass?: "retryable" | "terminal" | "moderated" | "credits";
  sourceAssetIds?: string[];
  sourceFingerprint?: string;
  retryCount?: number;
  nextRetryAt?: number;
  actualCredits?: number;
  actualUsd?: number;
  error?: string;
};
```

Execution payloads are stored separately from the compact UI record so queue
lists and manifests never expose raw API keys or duplicate large base64 media.

```ts
type VideoScriptSlot = {
  id: string;
  assetId?: string;
  poolAssetIds?: string[];
  pinned?: boolean;
  seconds?: number;
};

type VideoScriptRow = {
  id: string;
  slots: VideoScriptSlot[];
  promptIds: string[];
  compiledPrompt: string;
  settingsOverride?: Partial<Flux3VideoSettings>;
};

type VideoScriptProject = {
  id: string;
  name: string;
  sourceCollectionIds: string[];
  rows: VideoScriptRow[];
  promptMode: "single" | "zip" | "rotate" | "combo" | "cartesian";
  timingMode: "even" | "timed";
  settings: Flux3VideoSettings;
  permutationSeed: number; // repeatable plan expansion only; not a FLUX seed
};
```

Prompt records gain optional backward-compatible metadata:

```ts
type PromptMediaType = "image" | "video" | "shared" | "audio";
type VideoPromptCategory = "simple" | "detailed" | "sequence" | "dialogue_sound";

type PromptRecord = {
  // existing fields remain unchanged
  mediaType?: PromptMediaType;
  videoCategory?: VideoPromptCategory;
  tags?: string[];
  videoStructure?: {
    setup?: string;
    beats?: Array<{ start?: number; end?: number; text: string }>;
    camera?: string;
    dialogue?: string;
    sound?: string;
    ambience?: string;
  };
};
```

Successful saved generations also normalize into an additive read model:

```ts
type GenerationEvaluationRecord = {
  schemaVersion: "bfl-evaluation/v1";
  id: string;
  mediaType: "image" | "video";
  provider: string;
  model: string;
  endpoint: string;
  operation: string;
  prompt: { text: string; approximateTokens: number; sourceIds: string[] };
  settings: Record<string, unknown>; // secrets and binary inputs removed
  timing?: {
    requestStartedAt: string;
    providerAcceptedAt?: string;
    providerReadyAt?: string;
    downloadedAt?: string;
    capturedAt: string;
    durations: Record<string, number | undefined>;
  };
  cost: {
    submittedCredits?: number;
    chargedCredits?: number;
    creditsBefore?: number;
    creditsAfter?: number;
  };
  output: { previewUrl: string; localPath?: string; metadataPath: string };
  sources: { assetIds: string[]; collectionIds: string[]; keyframes: unknown[] };
  annotation: {
    rating?: number;
    verdict: "unreviewed" | "keep" | "maybe" | "reject";
    tags: string[];
    notes: string;
    updatedAt?: string;
  };
};
```

Evaluation annotations live under
`outputs/flux-api-control-surface/.evaluations/annotations.json` and use the
same serialized temporary-file plus atomic-rename pattern as Collections. Raw
API keys and full binary/base64 media are never copied into this read model.

## Authoritative Runner And Scheduler

The authoritative runner is a server-side singleton owned by the local Next
server. It is started during server initialization and also nudged after queue
mutations. It keeps processing work when no browser tab is open.

Queue state lives under the existing output workspace, for example:

```text
outputs/flux-api-control-surface/.generation-queue/
  queue.json
  runner-lease.json
```

Writes use the collection store precedent: serialize mutations in-process,
write a process-specific temporary file, then atomically rename it. A renewable
lease contains an owner token and expiry. Only the lease owner may submit or
advance jobs; a new process may acquire an expired lease and resume persisted
polling. This prevents two tabs or two local server processes from double-
submitting the same job.

The scheduler selects jobs by global order and priority, then enforces:

- dependency completion;
- global active-job limit;
- per-lane limits;
- paused/cancelled state;
- retry/backoff availability.

Proposed server-runner defaults:

```ts
global: 4
image: 4
tool: 2
video: 2
```

The effective number is always constrained by the global limit. A running video
can coexist with image or VTO work when another lane and global slot are free.
HTTP 429 applies exponential backoff and can reduce the active limit for the
current session.

The legacy browser image runner remains at its existing concurrency of 10 until
it is replaced atomically by the server runner. Phase 1 must not silently change
production throughput while its new selector is still disconnected.

Jobs with dependencies remain `waiting` until every dependency is complete and
has a resolvable `resultAssetId`. A failed or cancelled dependency blocks the
dependent job with a recoverable explanation.

## Provider Lifecycle Split

Every paid BFL operation is decomposed into resumable server functions:

1. `submit`: validate/resolve media, submit upstream, then persist
   `providerRequestId`, `pollingUrl`, submit cost, and status before returning.
2. `pollStep`: perform one provider poll and persist the observed status. It
   never loops for five minutes inside a route handler.
3. `finalize`: when Ready, download the ephemeral result immediately, save the
   artifact/metadata, reconcile actual cost, and attach `resultAssetId`.

The runner schedules poll steps with a `nextPollAt` timestamp. A server restart
continues from the persisted polling URL. Existing synchronous routes become
compatibility wrappers that enqueue and optionally wait; they do not retain an
independent five-minute polling loop.

Provider lifecycle code is shared by image generation, image tools, and
FLUX.3. Output-specific finalizers remain small and focused because image,
video, draft-cache, and optional remote-archive persistence differ.

## Failure Taxonomy And Circuit Breakers

Classify failures before retrying:

- **Retryable:** HTTP 408/429/5xx, transient network failures, temporary poll or
  download failures. Use bounded exponential backoff with jitter.
- **Terminal input:** validation/422, corrupt or missing media, unsupported
  parameters. Never retry unchanged input.
- **Moderated:** `Request Moderated`, `Content Moderated`, or equivalent safety
  result. Never auto-retry or raise tolerance automatically.
- **Credits:** HTTP 402 or an insufficient-credit response. Pause the global
  queue before another paid job is submitted.
- **Authentication:** invalid/missing key. Pause paid execution until key status
  changes.

Jobs record their source asset IDs and a stable source fingerprint. Repeated
terminal failures from the same source quarantine that source within the batch
so one bad image does not generate N pointless attempts. A circuit breaker also
pauses a lane after repeated provider-wide 429/5xx failures.

## HTTP Surface

Keep existing public endpoints and response shapes:

- `POST /api/bfl/generate`
- `POST /api/bfl/tools`
- `GET/POST /api/bfl/flux3-video`
- `POST /api/dashboard/run-plan`
- `POST /api/dashboard/batch`

Add resumable provider-job operations under the existing `/api/bfl/*` style:

- `POST /api/bfl/jobs` validates and submits one queued provider operation,
  persisting its request ID and polling URL before responding.
- `GET /api/bfl/jobs?id=<queueJobId>` performs one poll step using the stored
  polling URL; clients cannot supply an arbitrary polling URL.
- `PATCH /api/bfl/jobs?id=<queueJobId>` finalizes a Ready result by downloading
  and saving it once.

These routes call the same server lifecycle functions as the queue runner. They
are diagnostic/recovery primitives, not a second scheduler.

Add queue orchestration using the existing route style:

- `GET /api/dashboard/queue` lists compact jobs and scheduler state.
- `POST /api/dashboard/queue` validates and enqueues one or more jobs.
- `PATCH /api/dashboard/queue` handles pause, resume, reorder, retry, and
  priority changes.
- `DELETE /api/dashboard/queue?id=<jobId>` cancels or removes a job.

`/api/dashboard/run-plan` gains an optional media/job discriminator while the
existing image body remains the default. `/api/dashboard/batch` is migrated to
enqueue and wait through the authoritative queue while preserving its existing
response shape and `execute=false` dry-run behavior. Its current sequential
executor is then removed so concurrency, retry, moderation, cost, and recovery
cannot drift from the queue.

The stable v1 manifest lists the new routes. No v2 path or MCP tool suffix is
introduced.

The capture/evaluation HTTP surface is already available:

- `GET /api/evaluations` returns normalized records and supports ID, media,
  model, verdict, search, and limit filters.
- `GET /api/evaluations?format=jsonl` returns newline-delimited records for
  agent/model-evaluation pipelines.
- `PATCH /api/evaluations?id=<generationId>` writes rating, verdict, tags, and
  notes without mutating original generation metadata.

## MCP Surface

Keep existing tool names and result behavior. Add:

- `list_generation_queue`
- `enqueue_generation_jobs`
- `update_generation_job`
- `cancel_generation_job`
- `list_evaluations` (implemented)
- `update_evaluation` (implemented)

Existing paid tools may accept an additive `wait` option. `wait=true` preserves
the current completed-result response; `wait=false` returns a queue job ID.
Input schemas are typed and bounded rather than accepting arbitrary media paths.
Because the server owns execution, `wait=false` jobs continue without an open
dashboard tab. MCP coverage tests continue enforcing route/tool manifest parity.

## CLI Surface

`ui/cli/bfl-dashboard.mjs` is a thin HTTP client, invoked with
`npm run --silent cli -- <command>`. It shares `BFL_DASHBOARD_URL` with the MCP server,
accepts request JSON from a file or stdin, and writes response JSON directly to
stdout so Codex and shell agents can compose it safely.

Implemented commands are `context`, `assets`, `evaluations`, `evaluate`,
`plan`, `batch`, `generate-image`, `generate-video`, and `run-tool`. Paid
commands call the existing server routes and do not contain an alternative BFL
client, polling loop, persistence path, or queue. Once the server-owned queue is
live, the same commands inherit it without a CLI migration.

## Video Planning Engine

Implement a pure `video-script-plan` module before the React matrix. It accepts
resolved asset IDs, slot pools, prompt IDs, permutation mode, timing mode,
settings, planner seed, and hard cap. It returns repeatable editable rows plus
warnings and the final queue-job preview. The planner seed controls expansion
only; FLUX.3 exposes no fresh-generation seed.

Expansion order:

1. Normalize and deduplicate source asset IDs.
2. Apply pinned/manual slots.
3. Expand selected image permutation mode.
4. Deduplicate identical ordered keyframe rows.
5. Apply prompt assignment mode.
6. Validate FLUX.3 keyframe, timing, duration, and safety constraints.
7. Apply the hard job cap.
8. Estimate cost and emit queue-ready plans.

Cartesian prompt expansion is opt-in and never implied by selecting multiple
prompts.

The plan records estimated price from the selected mode/duration/resolution and
later reconciles it with BFL's submit-time `cost`. Batch defaults are 8 seconds,
HD, 16:9, audio on, and draft-first; 20 seconds is an explicit high-cost choice.

## UI Structure

`ScriptPanel` becomes a small shell with Image and Video sub-tabs. Existing
image-pair UI moves without behavior changes. The Video sub-tab composes focused
components rather than one page monolith:

- `VideoScriptSources`
- `VideoScriptMatrix`
- `VideoScriptRow`
- `VideoScriptPromptPicker`
- `VideoScriptSettings`
- `VideoScriptTimingTemplate`
- `VideoScriptPlanPreview`

Extract a generic asset drop slot from the current VTO/FLUX.3 affordances. Four
slots render initially; Add keyframe expands to ten. Rows can be manually edited
after automatic expansion.

Matrix interaction commitments:

- Slot-column drops bind a pool to a keyframe position (generation input);
  cell drops override one row only. The two targets are visually distinct.
- Rows carry generated/edited provenance. Regeneration replaces only unedited
  rows; edited rows survive unless explicitly discarded.
- The UI surfaces two generator workflows — sequence-from-one-pool and
  per-slot pools with a Cartesian/zip/seeded-sample strategy toggle — over the
  full engine mode set, never a flat nine-item mode menu.
- The plan preview shows the live raw → deduplicated → capped → estimated-cost
  chain while editing.

Audio Script beat, transition, and locked-marker timestamps can be imported as
timed keyframes. The import maps selected marker times to `[seconds, image]`
slots and remains editable before planning. Timed batches apply one batch-level
timing template across rows, with a per-row timeline editor for overrides, so a
batch reads as one audio timeline driving many visual permutations.

The global queue is rendered from shared state and remains visible from image,
tool, FLUX.3, and Script workspaces. A full Queue/History view can live where
the current Run Log is exposed, with a compact active summary in generation
panels.

## Persistence And Recovery

The file-backed server store is authoritative from the first live queue
migration. Browser localStorage may cache presentation preferences, but it is
never the execution source of truth. Store JSON records under the existing
output workspace, never secrets.

Persist:

- compact job state and timestamps;
- sanitized execution descriptor;
- dependency IDs;
- BFL request ID and returned `polling_url`;
- retry count and next retry time;
- lease owner/expiry and next poll time;
- failure class, source fingerprint, and circuit-breaker state;
- result asset ID and output paths.

Do not persist API keys, full data URLs, or expiring delivery URLs as the only
copy of an output.

## Implementation Phases

### Phase 0 — Product And Architecture

- [x] Record PRD.
- [x] Record implementation plan.
- [x] Confirm API v1 and MCP compatibility policy.
- [x] Confirm one global queue with internal lanes.

### Phase 1 — Queue Model Foundation (Completed, Not Yet Live)

- [x] Generalize queue kinds, lanes, lifecycle, summary, and dependency state.
- [x] Add pure lane-aware selection helpers and tests.
- [x] Mark legacy browser image jobs as `kind=image`.
- [x] Update the compact queue UI to identify job kind.
- [x] Restore the legacy live image concurrency to 10 until server migration.
- [ ] Wire the selector and extended lifecycle into production execution. This
  deliberately moves to Phase 2/3 after the server substrate exists.

### Capture And Evaluation Slice (Completed)

- [x] Capture successful request/submission/provider/download timings in image,
  image-tool, and FLUX.3 output metadata.
- [x] Normalize saved output metadata into `bfl-evaluation/v1` records.
- [x] Add atomic rating/verdict/tag/note annotations.
- [x] Add persistent dashboard evaluation filters, previews, and JSON/JSONL
  export alongside the browser-session Run Log.
- [x] Add `/api/evaluations` GET/PATCH, `list_evaluations`, and
  `update_evaluation` with MCP coverage.
- [x] Add the thin local CLI for context, assets, evaluation, planning, and
  current image/tool/video generation routes.
- [ ] Extend the same record with failed attempts, retries, queue wait time, and
  recovery events during Phase 2 instead of adding a new run-history store.

### Phase 2 — Server Queue Substrate And Provider Lifecycle

- [ ] Implement the atomic file-backed queue store.
- [ ] Implement renewable runner lease and single-owner server tick.
- [ ] Implement submit, poll-step, and finalize/download lifecycle services.
- [ ] Add `/api/bfl/jobs` POST/GET/PATCH recovery primitives.
- [ ] Persist provider request ID and polling URL before the first poll.
- [ ] Implement failure taxonomy, retry backoff, credit/auth pause, source
  quarantine, and provider circuit breakers.
- [ ] Add restart, expired-lease, and no-browser execution tests.

### Phase 3 — Migrate Existing Execution And Expose Queue Controls

- [ ] Move image generation to the server runner.
- [ ] Enqueue VTO and all image tools.
- [ ] Enqueue FLUX.3 single generation and draft enhancement.
- [ ] Add `/api/dashboard/queue` CRUD and server-side wait semantics.
- [ ] Make `/api/dashboard/batch` enqueue-and-wait; remove its independent
  sequential executor.
- [ ] Add pause, retry, cancel, reorder, clear-settled, and cost reconciliation.
- [ ] Preserve immediate-result behavior for existing HTTP and MCP callers.
- [ ] Add MCP queue tools, manifest/context coverage, and lockstep tests.

### Phase 4 — Video Prompt Library

- [x] Extend prompt types and route normalization (`mediaType`, `videoCategory`,
  `tags`, `videoStructure`, `provenance`; unknown values dropped, records
  without the fields untouched).
- [x] Add grouped Image, Video, Shared, and Audio library views alongside the
  existing per-domain collections.
- [x] Add video categories and structured prompt sections.
- [x] Ship starter template packs per category with `{placeholder}` fill-in
  blanks, style quick-buttons, and the positional "image 1 / image 2" keyframe
  convention.
- [x] Add the type-first Video Script prompt composer: prompt-type selector,
  one large editable field as the batch source of truth, style quick-buttons,
  and the grouped library browser as the secondary path.
- [x] Block uncompiled `{placeholder}` prompts at the planner
  (`prompt_placeholders`) and enqueue boundaries.
- [x] Save FLUX.3 asset prompts into the Video library, and promote a
  keep-rated generation's prompt with its provenance.

### Phase 5 — Video Script Planner And UI

- [ ] Implement repeatable image/prompt expansion library.
- [ ] Add folder/Collection source browser.
- [ ] Add editable four-to-ten-slot matrix.
- [ ] Add pin/vary, rotate, combination, permutation, zip, Cartesian, and
  planner-seeded sample modes behind the two generator workflows.
- [ ] Add distinct pool-binding (column) versus cell-override drop targets.
- [ ] Add edited-row protection across regeneration.
- [ ] Add even/timed keyframes and global/per-row settings.
- [ ] Add the batch timing template with Audio Script marker import and
  per-row timeline overrides.
- [ ] Add the live raw → dedup → cap → cost batch preview, estimate/actual
  guardrail, and enqueue action.

### Phase 6 — Assets, Recovery, And Validation

- [ ] Add FLUX.3 badge/source filter and Video Script asset actions.
- [ ] Save complete batch/keyframe/prompt provenance.
- [ ] Run unit, route, build, browser, server-restart, lease, recovery, and MCP
  tests.
- [ ] Run one approved paid 10-keyframe, 5-second HD draft smoke test.

## Test Matrix

- Queue summaries cover every lifecycle state.
- Lane selection respects global and per-lane limits.
- Waiting dependencies become runnable only after required assets exist.
- Failed dependencies do not execute downstream video jobs.
- Two runner processes cannot hold a valid lease or submit the same job.
- Restart after submit resumes from the stored request ID and polling URL.
- A route timeout cannot discard an already accepted provider job.
- Retryable 429/5xx/network failures back off; moderation, invalid input, and
  insufficient credits do not auto-retry.
- Insufficient credits pause the queue before the next paid submit.
- Repeated terminal failure of one source quarantines its remaining permutation
  jobs instead of retrying each combination.
- Legacy image run-plan and batch request fixtures remain unchanged.
- `run_batch` uses the queue rather than a second executor.
- Permutation modes are deterministic, deduplicated, ordered, and capped.
- Prompt Cartesian expansion occurs only when explicitly selected.
- Timed keyframes serialize to `[seconds, image]`; even rows serialize to image
  arrays.
- FLUX.3 accepts 1–10 keyframes and rejects invalid duration/safety settings.
- FLUX.3 v2v uses the conservative 5–15 preview constraint until live docs and
  schema agree.
- Estimated cost is reconciled against BFL's returned `cost`.
- Queue manifest and MCP coverage match implemented routes and tools.
- Refresh/server restart can recover in-flight polling and locally saved
  outputs with no browser tab open.

## Definition Of Done

The feature is complete when image, tool, and video work share one server-run,
recoverable queue; Video Scripts can build repeatable editable keyframe/prompt
batches from Collections and audio markers; the local API v1 and MCP expose the
same workflow; outputs carry complete provenance; and the full automated plus
paid smoke-test matrix passes.
