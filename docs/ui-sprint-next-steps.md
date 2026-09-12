# UI sprint — remaining steps

Status: 12 September 2026. Implementation paused at the user's request so the
remaining changes can be reviewed individually. This draft checkpoint preserves
the current implementation; it does not mark the remaining steps complete.

Preserve the approved collection sizes, three generation shaders, one-second
generation reveal, half-second video reveal from black, queue animation and
timers, comparison grip, and white navigation arrows.

## 1. Restore a clean working build

**Done:** move the client directive back to the first line of
`ui/lib/use-dashboard-state.ts`. TypeScript and whitespace checks pass, and the
main dashboard opens again without the compilation overlay.

Before each later review, check the changed components and the running page.

## 2. Finish References and action-button polish

**Implemented; final review pending.**

- References starts collapsed, with a left-aligned chevron, title and count.
- Opening/closing preserves the references and releases space for the prompt.
  Submitted references and the submission preview now collapse inside this panel.
- Preset groups above the prompt align with its right edge.
- A source image can occupy multiple roles without moving its earlier assignment;
  repeat drops into the same target reuse that assignment and respect the model limit.
- Panel, role cards and labels follow the chosen light or dark theme.
- Each empty role card is a complete click/drop target; remove the tiny inner
  dashed Add box. Filled cards retain thumbnails, removal and adding more.
- Handle drops once, without bubbling into the parent prompt drop handler.
- Soften only the primary action fill on hover/focus to expose the moving edge.
- Keep the circulating accent on Generate, Edit and Upscale: faint when idle,
  clearer on hover and stronger while running.

Checked in a temporary preview: collapsed initial state, reopening with inputs
retained, light/dark theme, clicking the whole Character card to choose a file.
Reference copying, repeat drops, role removal and disclosure were checked with
local fixtures. Regression tests cover shared sources, legacy style slots, limits,
and metadata/cue preservation. Final hover appearance still needs user review.

## 3. Confirm the shared cube loader everywhere

**Shared component wired; final video-state audit pending.**

Use the same continuous cube on image/video Generate, Edit, Upscale, script
queueing and the video generation overlay. Preserve each tool's label and its
queue/submission rules. Check submitting, queued, running, completed and failed
states, including the video screen that still appeared to use a spinning icon.
Use mocked/local jobs for checks rather than paid provider submissions.

## 4. Give Frames the same disclosure and drop mechanics

**Not implemented.**

- Left-aligned collapsible Frames header with a populated count.
- Numbered full-card targets: Frame 1, Frame 2, Frame 3, extending as needed up to
  the existing ten-frame limit.
- Click to add; drop directly into the desired position; replace, remove and
  reorder without losing the remaining frames.
- Closing preserves inputs. Cards follow the panel theme.
- Restored timed keyframes retain their timestamps and expose them for editing.

Check empty/partial/full layouts, dropping into an individual slot, reordering,
removal, collapse/reopen and switching video modes.

## 5. Finish Recreate in the asset library

**In progress; not yet validated end to end.**

A circular-arrow action loads an asset's saved setup into its originating tool.
It must not enqueue or spend credits. Keep the existing Send prompt action.

Cover:

- Video generation: prompt, source mode, ordered images, timed frames when used,
  continuation source, duration, aspect, resolution, audio, safety and draft.
- Video Edit and Upscale: original source clip, prompt and operation settings.
- Image generation: original editable prompt, model, size, seed (including zero),
  references and their roles, reference influence and normalization.
- Image tools: original source and applicable masks, garments and tool settings.

The initial implementation includes a recipe reader, restoration helpers and a
local input store for new generations. Review this before treating it as ready:
validate stored data, preserve original inputs, avoid appending reference cues
again, handle repeat clicks and stale requests, and restore false/zero values.

For older outputs, recover available metadata and retained job descriptors. If
an original input was never saved or was removed, identify the missing input;
never substitute the output as its own source or claim an exact restoration.
Recipes must survive clearing completed queue jobs and exclude credentials.
A recipe-save failure must never retry an already successful paid generation.

Verify round trips using representative local fixtures and tests, including
missing inputs and restored timed keyframes. No paid generations for testing.

## 6. Fix the gallery blanking while scrolling

**Investigating; cause not yet established.**

The screenshots show card controls and labels disappearing along with media.
Treat this as a gallery rendering issue until evidence distinguishes browser
painting/compositing, card remounting and media loading.

- Reproduce long-gallery scrolling with mixed images/videos and different themes.
- Keep the complete card shell, labels, icons and controls visible immediately.
- Reserve media dimensions and show a lightweight placeholder only in the media
  area while it loads.
- Retain loaded media across scrolling and section changes where appropriate;
  preload nearby media only if measurements show it helps.
- Check large background effects and nested blur layers before adding more
  effects or eagerly loading every full-resolution asset.

Verify rapid down/up scrolling, returning to the gallery, video hover/switching,
slow media, missing media and repeated passes over already loaded cards.

## 7. Verify and checkpoint

After each step: show the result and collect feedback before changing the next
area. At the end, remove temporary fixtures, run relevant tests and the production
build, and review the final diff. Commit the tested work; if making a PR, verify
the repository, branch and base/head state first. Preserve unrelated changes.
