# Creator Workbench Bugs And UX Backlog

Date: 2026-06-13
Status: draft backlog after UI/code audit

This note captures current issues and UX refinements for the BFL-native
workbench before the broader provider-agnostic Creator Workbench pass.

## Current Bugs / Likely Bugs

### Audio sequence band edits feel inert

Observed behavior: changing a timing row between Low, Mid, and High does not
meaningfully change the generated sequence.

Likely cause: the timing row has both `kind` and `band`. The band dropdown only
updates `marker.band`, while `marker.kind` keeps its original analyzer
classification. Prompt generation currently checks `kind` first in several
motion branches, so a marker originally classified as `kick` can still behave
like a kick after the band is changed to High.

Possible fix:

- When band changes, update kind too: Low -> kick, Mid -> snare, High -> hat.
- Or make prompt generation prioritize the user-edited `band` over analyzer
  `kind`.
- Also invalidate the generated prompt whenever marker timing, marker band/kind,
  assigned images, shot prompt, setup, or quality text changes.

### Generated prompt can go stale after image or timing edits

Observed behavior: after generating an audio prompt once, moving/reassigning
images and generating/using again may not reflect the new image order reliably.

Likely cause: several edit actions update markers/shots, but do not clear the
cached `generatedPrompt`. The explicit Generate button should rebuild, but Copy,
Download, and Use Prompt can reuse the stale prompt if `generatedPrompt` is
already set.

Possible fix:

- Add a shared `markAudioPromptDirty()` path.
- Call it from marker updates, marker movement, image assignment/drop, shot text
  edits, setup edits, quality edits, target-model edits, and max-image-guide
  edits.
- Show a small dirty state such as "Prompt needs refresh" or auto-regenerate
  before Use Prompt.

### Image tool modes are mostly staged UI

Observed behavior: Erase, Inpaint, Outpaint, and Glyphs appear in the workspace,
but running them does not call a model endpoint yet.

Code audit:

- `ImageToolWorkspace` and `ToolRunPanel` display mode-specific controls and
  endpoint labels.
- `stageWorkspaceToolRun()` only sets a recovery message:
  "API route wiring is next."
- There are no local API routes yet for `flux-tools/erase-v1`,
  `flux-tools/outpainting-v1`, or `flux-pro-1.0-fill`.
- The current implemented generation route is `/api/bfl/generate`, which maps
  text/image references to FLUX.2 generation endpoints only.

Needed:

- Add a generic provider/model job route or specific BFL tool routes.
- Wire masks, dilation, outpaint offsets, target canvas size, and prompt fields
  into real payloads.
- Save tool outputs to the same asset library/run history as generation.

### MCP / agent surface lags current features

Current MCP/local agent manifest exposes:

- `/api/dashboard/context`
- `/api/dashboard/run-plan`
- `/api/dashboard/batch`
- `/api/bfl/generate`
- `/api/bfl/credits`
- `/api/outputs`
- `/api/prompts`
- `/api/reference-archive`
- `/api/mcp/status`

It does not yet expose:

- workspace tool runs: erase, inpaint, outpaint, glyphs
- audio analysis / audio guide rendering / audio prompt composition
- prompt assets and generated prompt library operations
- provider/model registry
- job manifest creation/execution
- shader render/export
- Holodeck scene/record controls
- reference handle assignment such as `@img1`, `@video1`, `@audio1`,
  `@shader1`, `@scene1`

## UX Backlog

### Store prompts as first-class library assets

The final prompt should be reusable like an asset, not only text inside a panel.

Add a prompt/preset asset type that can hold:

- raw prompt text
- resolved/final provider prompt
- source prompt blocks
- references used
- audio timing rows if generated from audio
- provider/model assumptions
- created output links

Prompt assets should be referable as `@prompt1`, searchable in the gallery, and
attachable to new jobs.

### Reference highlighting in the gallery

When an asset is assigned as a reference, the gallery should show it visibly.

Desired states:

- selected for job
- assigned as `@img1`, `@img2`, `@video1`, etc.
- used in current generated prompt
- included in current run manifest
- selected for collection/training

Current `selectedAssetIds` is collection-oriented and does not distinguish these
roles.

### Drag, drop, handles, and annotations

Assets should be easy to drag into prompt/reference slots and should carry
visual labels:

- stable handle badge: `@img1`, `@video1`, `@audio1`, `@prompt1`
- short display name
- role: subject, style, storyboard frame, mask, audio, shader guide, scene
- source/provider
- provenance/output run

This should work for images first, then video/audio/shader/scene assets.

### Provider/model picker

The UI can start BFL-native, but should shift from "one model UI" to:

```text
provider -> model -> capabilities -> inputs/settings
```

Examples:

- BFL -> FLUX.2 image generation, Erase, Outpainting, Fill
- fal -> LTX / audio-reactive LoRA
- Seedance-style provider -> image-to-video or video-to-video
- RunPod -> custom flags model, Comfy workflows, LoRA inference
- local -> shader render, audio analysis, Holodeck record

### Job manifest as the center

The UI should write a job manifest before execution. Agents or provider adapters
can then execute the manifest through official APIs, own APIs, local tools, or
RunPod/cloud sessions.

This lets the human UI author intent while MCP/agents handle operation.

## 2D vs 3D UX Direction

Use 2D as the primary production surface for now.

Recommended structure:

- 2D dashboard: asset library, prompt/reference handles, provider/model picker,
  job manifests, run history, settings, and MCP controls.
- Holodeck tab: full 3D viewport with a compact overlay for scene, camera,
  character, audio routes, and recording.
- Shader tab: standalone shader editor/recorder that saves video or metadata
  assets to the library.
- Shared asset tray: visible across tabs or quickly summonable.

3D panels inside Holodeck are appealing for presentation and immersive review,
but should not be the primary editing UI yet. They add complexity and make
precision work harder. A better near-term pattern is:

```text
2D workbench owns intent and memory
  -> Holodeck tab records the world/video input
  -> outputs return to the shared asset library
```

Later, Holodeck can expose diegetic 2D panels inside the 3D world as a show mode
or advanced interface, reusing the same underlying controls.

## Suggested Cleanup Order

1. Fix audio prompt invalidation and band/kind behavior.
2. Make final/generated prompts first-class prompt assets.
3. Add current-reference highlighting and stable handle badges in the gallery.
4. Add a provider/model/job manifest abstraction.
5. Wire BFL Erase/Outpaint/Fill tool routes into real asset-producing runs.
6. Expand MCP manifests/routes to match current UI features.
7. Add Shader as a local provider/tab that exports video and metadata assets.
8. Add Holodeck as a local provider/tab for scene control and recording.
