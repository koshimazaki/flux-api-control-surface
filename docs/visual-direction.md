# Visual direction

Rules and invariants for changing the Visual direction panel and its 3D
preview. What the panel does for users is in
[`../ui/README.md`](../ui/README.md) under FLUX 3 Video.

## Contracts

- Internal names stay `camera-*`. Term IDs, clause strings, storage keys and
  the saved `camera` choice (`{ selection, edits }`) are compatibility
  surfaces; keep them stable.
- Only a term's clause reaches the API. Its preview hints never do
  (`ui/lib/camera-term.ts`).
- One term per section, plus None, with clauses editable in place. The dialog
  edits a draft: Cancel discards it, Done applies it.
- No preview action submits a paid generation.
- The panel and dialog are titled "Visual direction", with
  `DIRECTION_SUBTITLE` as the supporting line. The current choice is a
  separate summary such as `Close-up · Eye level`, or `No direction selected`
  (`ui/lib/camera-language.ts`).

## Colour and marks

- Neutral first. Resting marks and labels use `--text-secondary`, hover and
  focus `--text-primary`. Section colour appears only on headings, the
  selected mark, a thin border and a light tint. None stays neutral. A chosen
  term also shows a check, so colour is never the only signal, and the focus
  ring stays visible on a selected term.
- Section colours are the `--camera-*` aliases at the top of
  `ui/app/styles/camera-language.css`, grouped by meaning, never by
  `nth-child` position. Lighting's warm yellow is the one literal colour.
  Rams Lite overrides the same aliases with darker `color-mix` values for
  contrast, and BFL Stone collapses accents to green by design. Do not borrow
  `--acc-armament` for violet: it is orange in the base theme.
- Shot size, angle and movement keep their parametric pose glyphs
  (`camera-glyph.tsx`). Every other term has its own mark in
  `direction-marks.tsx`, drawn in the same grammar or as an explicitly
  imported Lucide icon at the same stroke. Marks use `currentColor` and are
  `aria-hidden`; every term keeps its visible label and description tooltip.
  Different meanings get different silhouettes: VHS is not Split screen, and
  rack focus is not a zoom.

## Where things live

| Concern | Files (`ui/`) |
| --- | --- |
| Term shape, terms and clauses | `lib/camera-term.ts`, `lib/camera-terms-camera.ts`, `lib/camera-terms-look.ts`, `lib/camera-terms-effects.ts`, `lib/camera-language.ts` |
| Rig pose and paths | `lib/camera-paths.ts` |
| Hint channels: geometry, lens, focus, shutter, lighting, transition, rig, format, grade, media, FX | `lib/preview-channels.ts` |
| Coverage per term: `shot`, `diagram`, `approximation` or `prompt-only`, with a note | `lib/preview-support.ts`, shown by `components/preview-coverage.tsx` |
| Scene lifecycle and renderer | `lib/camera-scene.ts` |
| Scene parts, test stage, effect stand-ins | `lib/camera-scene-build.ts`, `lib/camera-scene-stage.ts`, `lib/camera-scene-fx.ts` |
| Shot finishing pass and its shader | `lib/camera-scene-post.ts`, `lib/camera-scene-shader.ts` |
| Panel, dialog, grid, drawer | `components/camera-panel.tsx`, `components/camera-dialog.tsx`, `components/camera-presets.tsx`, `components/camera-preview.tsx` |

A new term needs a clause, a mark and a coverage record.
`tests/direction-marks.test.ts` and `tests/preview-support.test.ts` fail when
one is missing.

## Invariants

Each of these was a real bug; keep it fixed.

- One canvas for the drawer's life. Replay, view and selection changes
  restart the scene on it; never remount the canvas to replay.
- One `WebGLRenderer` per canvas (the `renderers` WeakMap in
  `camera-scene.ts`), kept across theme rebuilds with
  `dispose({ keepRenderer: true })`. Every extra renderer on a canvas leaks
  placeholder textures and framebuffers that `dispose()` never frees.
- Dispose light shadows explicitly (`key.shadow.dispose()`); the renderer
  does not.
- Never call `Line.computeLineDistances()` per frame: it allocates a new
  attribute each time. Update dash distances in place.
- Hints travel in separate channels, so a format, a grade and a media look
  can coexist instead of overwriting one another.
- Each view gets its own focus, lens and media treatment with its own colour
  and depth (`viewColour` in the shader) before split screen, dissolve or
  double exposure combine the views. Grade and format apply to the whole
  frame after.
- Depth of field exists only in the shot view, from the depth buffer. Never
  blur the whole canvas to suggest shallow focus.
- Reduced motion: a live `prefers-reduced-motion` listener, one still per
  selection, and a replay that respects it. No CSS keyframe animations in the
  preview.
- Time terms need motion: shutter terms add a bouncing timing ball.
- No horizontal overflow at 390px in any theme.

## Known gaps

- Large format is prompt-only.
- The shot view is always 16:9; it does not follow the chosen aspect ratio.
- On a phone the dialog splits its height between the grid and the preview.
- The scene diagram is the default view; the shot view's look is due a
  revisit.
- All fourteen sections of BFL's camera guide are covered, not every term in
  it.

## Checks

- `cd ui && npm test && npm run lint && npm run build`. With a dev server
  running, build into a separate output directory so its `.next` survives.
- In a browser: replay ten times, churn selections, close and reopen the
  drawer, Cancel and Done. Test reduced motion at mount and switched live, a
  hidden tab, resize, WebGL off and a theme switch; live GL buffers, textures
  and programs should stay flat. Compare Reflective, Frozen, BFL Stone and
  Rams Lite at desktop width and 390px.
