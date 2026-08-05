# Work Order — Server Queue Substrate And Migration (Phases 2 + 3)

Executor: a fresh implementation session. The authoritative specifications are
[flux3-video-scripts-implementation.md](./flux3-video-scripts-implementation.md)
and [flux3-video-scripts-prd.md](./flux3-video-scripts-prd.md). This work order
adds verified codebase facts, hard constraints, and verification gates. If it
conflicts with those documents, the documents win and the conflict must be
reported, not silently resolved.

## Objective

Implement Phase 2 (server queue substrate and provider lifecycle) and Phase 3
(migrate existing execution and expose queue controls). Deliver a server-owned,
file-backed, recoverable queue that every paid entry point uses, with MCP
parity and every existing HTTP/MCP contract preserved.

## Read first, in this order

1. `docs/flux3-video-scripts-implementation.md` — Architecture Rules 8–10,
   Authoritative Runner And Scheduler, Provider Lifecycle Split, Failure
   Taxonomy, HTTP Surface, Phases 2–3, Test Matrix.
2. `docs/flux3-video-scripts-prd.md` — Universal Queue Requirements.
3. This file. Re-verify the facts below before relying on them; never assume.

## Verified starting facts (as of 2026-08-05, uncommitted working tree)

- The live production runner is a ref-based `while` loop in
  `ui/lib/use-dashboard-state.ts` (~line 676) using the flat
  `GENERATION_QUEUE_CONCURRENCY = 10`. The pure helpers in
  `ui/lib/generation-queue.ts` (`selectRunnableGenerationJobs`,
  `generationDependencyState`, lane limits, retry gating) are tested but not
  wired to production.
- All three provider routes are synchronous submit+poll+download+save inside
  one handler: `ui/app/api/bfl/generate/route.ts`, `ui/app/api/bfl/tools/route.ts`,
  `ui/app/api/bfl/flux3-video/route.ts`. Polling is `pollResult` in
  `ui/lib/bfl-server.ts` (750 ms interval, 300 s budget); the FLUX.3 route has
  `maxDuration = 300`. There is no submit-only or poll-by-id route today.
- Atomic JSON store precedents: `ui/app/api/collections/route.ts` (temp file +
  rename) and `ui/lib/generation-evaluation-server.ts` (same pattern plus an
  in-process write queue).
- `/api/dashboard/batch` is a second, sequential, server-side executor. Phase 3
  turns it into an enqueue-and-wait wrapper and removes the independent loop.
- MCP: `ui/mcp/server.mjs` currently registers 25 tools; parity with
  `ui/lib/agent-routes.ts` (`localDashboardMcpTools`, route map, coverage) is
  enforced by `ui/tests/mcp-coverage.test.ts`. Every new route or tool requires
  `agent-routes.ts` (and `agent-guide.ts`) updates in the same change.
- Capture: `ui/lib/generation-capture.ts` builds success-only timing blocks in
  output metadata. The evaluation read model is
  `ui/lib/generation-evaluation.ts` + `ui/lib/generation-evaluation-server.ts`
  + `GET/PATCH /api/evaluations`; annotations live at
  `outputs/flux-api-control-surface/.evaluations/annotations.json`.
- Suite state: 248 tests across 41 files green via `npm test` (vitest);
  `npm run build` passes.

## Design requirements beyond the docs (emphasis and known fixes)

1. **Queue store** at `outputs/flux-api-control-surface/.generation-queue/`
   (`queue.json`, `runner-lease.json`): atomic temp+rename writes, in-process
   mutation serialization, sanitized job descriptors only — no API keys, no
   base64 media, and no expiring delivery URL as the only copy of anything.
2. **Runner**: server-side singleton cached on `globalThis` so Next dev HMR
   cannot spawn duplicates; renewable lease with owner token and expiry; an
   expired lease is acquirable and resumes persisted polling; only the lease
   owner submits or advances jobs; every queue mutation nudges a tick;
   `nextPollAt` scheduling — no long-held HTTP handlers.
3. **Lifecycle services** shared by the runner and the recovery routes:
   `submit` persists `providerRequestId` + `pollingUrl` **before** the first
   poll; `pollStep` performs exactly one poll; `finalize` downloads
   immediately, saves through the existing savers (`saveOutputFiles`,
   `saveFlux3VideoOutput`), and reconciles actual cost and credit deltas.
4. **`/api/bfl/jobs`** POST/GET/PATCH per the plan. GET and PATCH operate by
   queue job ID and use only stored polling URLs — never accept a
   client-supplied polling URL.
5. **Failure taxonomy** per the plan: retryable / terminal / moderated /
   credits / auth; bounded exponential backoff with jitter; automatic queue
   pause on credits/auth; source quarantine via `sourceFingerprint`; lane
   circuit breaker after repeated provider-wide 429/5xx.
6. **Migration**: image generate, VTO and image tools, FLUX.3 single and draft
   enhancement all enqueue; legacy routes become enqueue-and-wait wrappers
   preserving their current response shapes; `/api/dashboard/queue` CRUD;
   the four MCP queue tools from the plan; the queue UI
   (`ui/components/ui/job-queue.tsx` and its host panels) reads server state
   and gains pause/resume/retry/cancel/reorder/clear-settled; queue state
   survives refresh and server restart.
7. **Capture extension**: failed, retried, and recovered attempts write
   failure class, attempt timings, queue wait, and recovery events into the
   same `bfl-evaluation/v1` model — additive fields, no second history store.
   While instrumenting the split lifecycle, fix two known timing flaws:
   measure finalize **after** artifact save (today `finalizeMs` is ~0 by
   construction), and give the credits check its own bucket or exclude it
   consistently (today image/tools leave it unbucketed while FLUX.3 counts it
   inside `downloadMs`, so `downloadMs` is not comparable across routes).
8. **Performance guard**: no per-request or per-tick full rescans of the
   outputs tree. Queue state reads come from the queue store. The evaluation
   scan may stay as-is but must not sit on the runner's hot path.
9. **Concurrency swap**: the legacy browser loop keeps concurrency 10 until
   the server runner replaces it atomically; server defaults are global 4,
   lanes image 4 / tool 2 / video 2, configurable and persisted in the store.

## Hard constraints

- **No paid generation.** Never call `api.bfl.ai` from tests or dev
  verification; mock the provider. Do not submit any real BFL job.
- **No git state changes.** Do not commit, stage, reset, checkout, stash, or
  clean. The tree holds large uncommitted work from other sessions. Report
  changed files instead.
- **No contract breaks.** Existing HTTP and MCP request/response shapes and
  all 248 existing tests stay intact; extend fixtures rather than rewriting.
- Keep files at or under roughly 500 lines — split modules instead of growing
  monoliths; match existing code style; no new dependencies without a strong,
  stated reason.
- No secrets in any new store, log, record, or export.

## Verification gates (all required)

1. `npm test` fully green, including new tests covering: store atomicity;
   lease exclusivity (two runners cannot both act); restart-resume from a
   persisted request ID and polling URL; an HTTP timeout cannot orphan an
   accepted provider job; taxonomy classification and backoff; credits pause;
   source quarantine; legacy fixture stability; `run_batch` through the queue;
   MCP parity.
2. `npm run build` passes.
3. Lint introduces no warnings beyond the pre-existing audio-script and
   training-collection ones.
4. A dev-server smoke check without paid calls: exercise
   `/api/dashboard/queue` CRUD and `/api/bfl/jobs` against a mocked provider
   path where feasible, and confirm the queue UI renders server state.

## Report format

Per-checklist status for every Phase 2 and Phase 3 item; files added and
changed; test count before and after; deviations from the docs with reasons;
known gaps and remaining work; and an explicit statement that no paid
generation and no git state changes occurred.

## Scope control

Complete Phase 2 fully before starting Phase 3. If capacity runs short, finish
and verify the current phase cleanly, stop, and report the exact boundary. Do
not start Phase 5 Video Script UI work — a later session owns it.
