# Design QA: Holodeck operator panels × FLUX API Control Surface

First-pass result: passed

Second-pass result: implemented; awaiting human visual verdict

## Comparison target

- Source visual truth: `/Users/radek/Documents/GIthub/Demos/MORPHKIT/experiments/quiet-signal/pack/references/private/holodeck-operator-panels.jpg`
- Source implementation truth: `/Users/radek/Documents/GIthub/HOLODECK/Holo` at `bef5668`, especially `src/styles/dsgndept-tokens.css`, `src/styles/dsgndept-materials.css`, and the Audio Intel, Camera and World Capture panel components.
- Target implementation: `ui/` on `codex/bfl-holodeck-morph`
- Implementation screenshot: `/Users/radek/Documents/GIthub/jobfund-hunt/tmp/design-audit/bfl-holodeck-morph-2026-08-19/05-bfl-morph-final.png`
- Full comparison: `/Users/radek/Documents/GIthub/jobfund-hunt/tmp/design-audit/bfl-holodeck-morph-2026-08-19/06-source-vs-final.jpg`
- Focused control comparison: `/Users/radek/Documents/GIthub/jobfund-hunt/tmp/design-audit/bfl-holodeck-morph-2026-08-19/07-focused-controls.jpg`
- Additional app-wide state: `/Users/radek/Documents/GIthub/jobfund-hunt/tmp/design-audit/bfl-holodeck-morph-2026-08-19/04-bfl-morph-assets.png`

## Viewport and state

- Source pixels: 1280 × 720.
- Implementation pixels: 1045 × 588.
- Browser CSS viewport: 1058 × 595 at reported device pixel ratio 1.21; the in-app Browser capture normalized the output close to CSS-pixel size.
- Full-view normalization: source centre-cropped and resized to 1045 × 588 before horizontal comparison.
- Focused normalization: source top control region resized to 1045 × 330; implementation top region captured at 1045 × 330.
- State: desktop-width responsive layout, Generate mode selected, one prompt selected, API key represented only as configured status, no paid generation invoked.

## Required fidelity surfaces

- Fonts and typography: passed. Instrument Sans and IBM Plex Mono remain the product fonts. Saira Semi Condensed and Saira Stencil One are added from the exact Holodeck stack for the technical display layer. Small labels use the Holodeck 10–11px mono scale, tracking and uppercase behaviour.
- Spacing and layout rhythm: passed. BFL's functional three-column/workspace structure remains intact while panels, controls, spacing units, radii, insets and launcher pills use the exact Holodeck token scale.
- Colours and visual tokens: passed. The child uses the exact Cyberpunk V2 slate ground, raspberry accent, cyan intelligence/readout signal, warm orange meter/heat signal, borders and metal ramp from Holodeck.
- Image quality and asset fidelity: passed for this design layer. The source contains no transferable raster asset beyond the screenshot evidence; the BFL mark remains the supplied BFL asset. Missing local gallery thumbnails in the temporary clone are an expected data-path boundary rather than a replacement asset.
- Copy and app-specific content: passed. BFL's existing product, queue, model, cost, prompt and asset terminology is preserved. The first pass's style-name footer was replaced with the functional `SERVER QUEUE / PROVENANCE / EVALUATION` status line.

## Full-view comparison

The child preserves the BFL information architecture and real workflow density while carrying the source's machined dark panels, hairline dividers, restrained red/cyan state signals, pill launchers, recessed values and raised controls. The visual hierarchy reads as one coherent developer instrument rather than a set of generic translucent cards.

## Focused-region comparison

The top control comparison verifies the details too small in the full view: exact active raspberry, cyan readout, gunmetal substrate, compact mono labels, 3/5/7px geometry, shallow raised controls, recessed fields and restrained glow. The BFL modes inherit the Holodeck launcher anatomy without importing Audio/Camera/Capture product semantics.

## Comparison history

### Pass 1

- P2: the added `OPERATOR CONSOLE / CYBERPUNK-V2` footer named the design operation inside the product and read like implementation-prompt leakage.
- Fix: replaced it with the BFL-relevant `SERVER QUEUE / PROVENANCE / EVALUATION` status line while holding typography, position and material invariant.
- Post-fix evidence: `05-bfl-morph-final.png`, `06-source-vs-final.jpg`, and `07-focused-controls.jpg`.

### Pass 2

- No actionable P0, P1 or P2 visual mismatch remains for the selected style-transfer contract.

## Interaction and browser checks

- Generate, Erase, Outpaint and FLUX.3 mode transitions were exercised in sequence.
- The lower dashboard tab strip and the Assets surface were rendered and captured.
- Browser warnings/errors after the final interaction timestamp: none.
- Paid generation, key mutation and destructive asset actions were intentionally not exercised.

## Follow-up polish

- P3: capture a larger desktop viewport and a portrait viewport when the selected browser exposes deterministic resizing.
- P3: repeat the asset-library capture from the durable local repo with its output directory configured so all saved thumbnails can be assessed as content, not only as chrome.

## Human-first second-pass review

Radek reviewed the first-pass child in the complete BFL application before any
second-pass scoring or repair suggestion. The transfer remained coherent and
non-generic, and the added colour signals made sections easier to recognise,
but the full-surface treatment was too heavy compared with the isolated
Holodeck panels. Fifteen review screenshots are preserved at
`/Users/radek/Documents/GIthub/Demos/BFL/tmp/design-audit/bfl-holodeck-second-pass-2026-08-19/human-review/`.

### Survived

- BFL product nouns, workflows, queue behaviour, assets and mode structure.
- Holodeck textures, raised controls, recessed values and raspberry/cyan state
  signals.
- A clear, authored identity rather than a generic dashboard fallback.

### Partial or lost

- The ambient semi-transparent shader and resulting sense of place were lost
  under the first-pass matte surface sweep.
- BFL's pill navigation survived too literally and conflicted with the
  Holodeck square geometry.
- Reference roles were useful but detached from the prompt they condition.
- The prompt library, API-key cluster and reference URL overused nested inset
  fields.
- The mobile surface was too tall and the full prompt library competed with
  the main task.
- FLUX.3 media and mode controls expanded more than their information density
  justified.

### Novel traits worth retaining

- Coloured panel backing improved mode and section recognition.
- The combined BFL structure and Holodeck material grammar remained legible
  across a much denser product than the visual parent.

Human verdict on the first pass: `repair`.

## Bounded second-pass repair

The user selected the continuous glossy direction by asking to code the
feedback directly. One coherent surface-integration repair was made:

- Restored a restrained cyan/raspberry/amber ambient shader behind more
  translucent, glossy panels instead of copying the earlier shader literally.
- Replaced oversized mode pills with blockier Holodeck controls and gave Erase
  a cyan active state.
- Moved Balance into the header and made the API-key controls an aligned,
  collapsible utility, eliminating the empty standalone top-right region.
- Moved Generate references into the prompt composer, removed the nested URL
  field treatment and collapsed advanced shaping behind a disclosure.
- Flattened prompt-library row internals, lightened the recessed prompt field,
  restyled sliders/selects/checkboxes and gave active queue work a cyan state.
- Made FLUX.3 mode selectors denser and collapsed the Prompt Library by default
  below 900px.

Frozen variables: BFL product nouns, state and API behaviour; Holodeck palette,
font stack and material vocabulary; generation, queue, asset and mode
workflows. The repair did not add themes, new FLUX.3 modes, video editing or a
motion-library dependency.

Rejected alternatives:

- Exact restoration of the panel-scale source shader: too strong across a
  complete application; a restrained coloured field better fits this target.
- A second static visual-template round: the user clarified that this pass
  should repair the code directly.
- Theme switching, new video modes and broad animation work: separate product
  features outside this one-repair stop rule.

## Second-pass verification

- `npm test`: 64 files, 494 tests passed.
- `npm run build`: passed.
- `npm run lint`: zero errors; the same four pre-existing warnings remain.
- `git diff --check`: passed.
- Automated browser reinspection could not be completed because the app
  browser's URL security policy rejected the already-open localhost page. No
  alternate browser route was used. The final desktop/mobile visual verdict
  therefore remains a human gate on `http://127.0.0.1:3017/`.

## Linked reflective-theme iteration

Branch: `codex/bfl-reflective-theme-morph`

### Human-first review of the repaired child

The operator reviewed the repaired BFL surface before this linked iteration.
Animations and the denser FLUX.3 arrangement were judged materially better,
and the overall direction remained worth keeping. The remaining defects were
specific: the material still needed a more reflective feel and a visible shade
field; Keychain and Balance were aligned but too large; FLUX.3 lacked a video
identity mark and its mode icons did not share one baseline; Jungle, Desert and
Lab inherited the same green selected state; and the design needed recoverable
theme comparison rather than another irreversible global repaint.

Human verdict on the repaired child: `repair` through one linked theme/material
pass, preserving the repaired branch as the comparison point.

### Repair made

- Added a persistent compact theme instrument with three controlled grounds:
  Reflective, Frozen and Quiet Signal. Theme changes only semantic material and
  colour tokens; model, prompt, queue, asset and output data are invariant.
- Increased shader visibility under lower-opacity panels and added directional
  specular highlights, edge reflection and stronger blur to the shared panel
  material.
- Put runtime, theme, Balance and Keychain in one compact utility line. Balance
  now exposes one value plus an icon action; API-key entry opens as an anchored
  overlay and no longer changes header height.
- Gave Magic Hour, Cinematic, Moonlit, Jungle, Desert and Lab distinct selected
  signals instead of one green state.
- Added a video-camera identity mark to the FLUX.3 header and placed Text,
  Images and Continue icons, names and descriptions on a consistent vertical
  grid.
- Carried the isolated cloud correctness commit `f5510a8` for missing local
  references, prompt-token insertion, the audio analysis window and queue
  overflow without importing a competing layout.

Frozen variables: BFL product nouns and workflows; API/keychain behaviour;
generation and queue semantics; current animation behaviour; repaired prompt
reference composition; FLUX.3 request modes and pricing; no remote publication.

Rejected alternatives:

- A wholesale light SIDKIT/RAMS repaint. The source parent remains `observed`,
  and replacing the BFL material ground would exceed a theme-level morph.
- Pulling the complete outer `ui-theme-revamp` branch. Its relevant audio
  transport was already present here, while its older global-CSS patch would
  reintroduce stale assumptions.
- Adding FLUX.3 video-edit modes in the material pass. That changes product
  behaviour and needs its own modular workflow decision.
- A fake decorative scope or radar. Quiet Signal requires operational signals
  to reflect real state; the retained ambient field is explicitly material,
  not simulated telemetry.

### Verification

- `npm test`: 66 files, 514 tests passed.
- `npm run build`: passed.
- `npm run lint`: zero errors; the same four pre-existing warnings remain.
- `git diff --check`: passed.
- Local preview: HTTP 200 at `http://127.0.0.1:3017/`; live queue/output polling
  also returned HTTP 200 with no server exception.
- Browser automation again rejected localhost under its URL policy, so the
  desktop/mobile material verdict remains the human promotion gate.
