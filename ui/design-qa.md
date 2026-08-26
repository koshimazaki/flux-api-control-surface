# Design QA: Holodeck operator panels × FLUX API Control Surface

First-pass result: passed

Second-pass result: implemented; awaiting human visual verdict

## Comparison target

- Source visual truth: Holodeck operator-panels reference image (local, private, not in repo).
- Source implementation truth: local Holodeck repo at `bef5668`, especially `src/styles/dsgndept-tokens.css`, `src/styles/dsgndept-materials.css`, and the Audio Intel, Camera and World Capture panel components.
- Target implementation: `ui/` on `codex/bfl-holodeck-morph`
- Implementation screenshot: local design-audit capture `05-bfl-morph-final.png` (2026-08-19, not in repo)
- Full comparison: local design-audit capture `06-source-vs-final.jpg` (2026-08-19, not in repo)
- Focused control comparison: local design-audit capture `07-focused-controls.jpg` (2026-08-19, not in repo)
- Additional app-wide state: local design-audit capture `04-bfl-morph-assets.png` (2026-08-19, not in repo)

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

- Generate, Erase, Outpaint and FLUX 3 mode transitions were exercised in sequence.
- The lower dashboard tab strip and the Assets surface were rendered and captured.
- Browser warnings/errors after the final interaction timestamp: none.
- Paid generation, key mutation and destructive asset actions were intentionally not exercised.

## Follow-up polish

- P3: capture a larger desktop viewport and a portrait viewport when the selected browser exposes deterministic resizing.
- P3: repeat the asset-library capture from the durable local repo with its output directory configured so all saved thumbnails can be assessed as content, not only as chrome.

## Human-first second-pass review

The operator reviewed the first-pass child in the complete BFL application before any
second-pass scoring or repair suggestion. The transfer remained coherent and
non-generic, and the added colour signals made sections easier to recognise,
but the full-surface treatment was too heavy compared with the isolated
Holodeck panels. Fifteen review screenshots are preserved at
`tmp/design-audit/bfl-holodeck-second-pass-2026-08-19/human-review/` (local, untracked).

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
- FLUX 3 media and mode controls expanded more than their information density
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
- Made FLUX 3 mode selectors denser and collapsed the Prompt Library by default
  below 900px.

Frozen variables: BFL product nouns, state and API behaviour; Holodeck palette,
font stack and material vocabulary; generation, queue, asset and mode
workflows. The repair did not add themes, new FLUX 3 modes, video editing or a
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
Animations and the denser FLUX 3 arrangement were judged materially better,
and the overall direction remained worth keeping. The remaining defects were
specific: the material still needed a more reflective feel and a visible shade
field; Keychain and Balance were aligned but too large; FLUX 3 lacked a video
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
- Added a video-camera identity mark to the FLUX 3 header and placed Text,
  Images and Continue icons, names and descriptions on a consistent vertical
  grid.
- Carried the isolated cloud correctness commit `f5510a8` for missing local
  references, prompt-token insertion, the audio analysis window and queue
  overflow without importing a competing layout.

Frozen variables: BFL product nouns and workflows; API/keychain behaviour;
generation and queue semantics; current animation behaviour; repaired prompt
reference composition; FLUX 3 request modes and pricing; no remote publication.

Rejected alternatives:

- A wholesale light SIDKIT/RAMS repaint. The source parent remains `observed`,
  and replacing the BFL material ground would exceed a theme-level morph.
- Pulling the complete outer `ui-theme-revamp` branch. Its relevant audio
  transport was already present here, while its older global-CSS patch would
  reintroduce stale assumptions.
- Adding FLUX 3 video-edit modes in the material pass. That changes product
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

## Human follow-up: shell consistency repair

The operator reviewed the linked Reflective child and kept the overall
direction, animations and denser FLUX 3 treatment. The remaining screenshot-
backed defects were narrow: theme and Keychain overlays painted behind the
workspace; the two prompt-preset groups sat too close to the right edge; the
Create video panel lacked the same corner identity gesture as Glyphs; and the
later-added FLUX 3 workspace did not share the surrounding spacing rhythm.
The operator also reviewed the Audio analysis/export sequence and concluded it
was coherent, so no Audio behaviour changed.

One bounded repair was made:

- Raised the topbar stacking context so both anchored overlays clear every
  workspace panel without changing their data or disclosure behaviour.
- Moved the lighting and environment presets into one centered toolbar and
  tightened icon-to-label spacing.
- Added the shared PanelHeader corner film mark to Create video.
- Confirmed all seven modes, including FLUX 3, already use the same
  `TabButtonBar`; replaced FLUX 3's later hard-coded inner gap and padding with
  the same Holodeck spacing token used by the surrounding workspace.

The repair keeps the theme system, shader, BFL workflows, FLUX 3 modes, queue,
pricing and Audio logic frozen. Verification: 66 files / 514 tests passed;
production build passed; lint has zero errors and the same four inherited
warnings; diff whitespace passed; `/` and `/api/dashboard/queue` returned HTTP
200 after the preview was restarted on port 3017. Final visual promotion remains
a human gate.

## Human follow-up: FLUX 3 scale and gallery stability

The next human review found that selecting FLUX 3 still appeared to zoom the
workspace, gallery thumbnails could disappear or stall during scroll, and the
reflective grain produced visible stripes across the gallery header/surface.
Inspection confirmed three bounded causes: FLUX 3 bypassed the shared collapsed
rail geometry, every missing legacy thumbnail rebuilt the full output-file
index, and the several-screen gallery carried both a repeating grain and a
full-height backdrop blur while the ambient shader continued rendering at 60fps.

One stability/material repair was made. FLUX 3 now preserves the shared 58px
rail and 340px control rhythm until the common mobile breakpoint. Output-image
lookups share a five-second server index, successful responses receive a durable
private cache policy, missing pointers receive a short negative cache, and
cards remember failed media for the browser session while valid images load and
decode lazily. The shader pauses during active scroll and renders its slow field
at 30fps. Only the asset library receives a clear, non-striped surface without
the full-height backdrop blur; other reflective panels are unchanged.

Verification: 66 files / 515 tests passed; production build passed; lint has
zero errors and the same four inherited warnings; diff whitespace passed. On
the restarted local preview, `/` and `/api/outputs?limit=5` returned HTTP 200.
An intentionally missing image returned the expected cached 404; after the
initial index build, the repeated lookup fell from about 2.68s to 0.06s. The
result remains local and the final scroll/material verdict remains a human gate.

## Human follow-up: RAMS surface and Video Upscale

The operator accepted the stability repair, requested the exact frost-grey /
white Quiet Signal RAMS surface as a theme preset, and selected Video Upscale
as the next BFL capability after checking the current official FLUX Tools set.
They also required the BFL brand spelling `FLUX 3` everywhere in visible copy,
removal of the unsupported local-runtime header claim, a separate Upscale
tab beside FLUX 3, the exact subtitle `FLUX 3 VIDEO UPSCALE · 2K / 4K`, and MCP
support rather than a UI-only mock.

Implemented and reviewed states:

- Desktop RAMS theme: exact grey/white, orange action and cyan intelligence
  tokens; subtle shader remains visible under pale glass; Key, Balance and
  theme instruments stay in one line.
- Desktop tabs: Generate through Glyphs all measured the same width; selecting
  FLUX 3 retained the same workspace rail and control column instead of zooming.
- Upscale: empty source state, Precise/Creative choice, 1.5×–3× factor, target
  dimensions, optional detail prompt, safety and cost estimate render as one
  coherent BFL tool workspace.
- Mobile: tabs use the same two-column component; Upscale has no internal
  overflow; the Assets header now stacks so its actions no longer widen the
  document or create a horizontal scrollbar.
- Overlay stacking: the theme menu rendered at z-index 1300 and the Key menu at
  1200 inside the topbar's 1400 stacking context, both above workspace panels.

The before/after fader, provider submission and output audio were not exercised
with paid inference. Their deterministic contracts are covered by unit/route
tests, while a real output remains the honest final quality gate.

Verification: `npx tsc --noEmit` passed; `npm test` passed 68 files / 524 tests;
`npm run build` passed; `npm run lint` reports zero errors and the same four
inherited warnings; live browser inspection found no horizontal overflow at
the narrow breakpoint. The former dotted video-brand spelling no longer occurs;
technical `flux3` route and code identifiers remain unchanged by design.

## Human follow-up: narrow Prompt Library rhythm

The operator's 1558×1100 and mobile captures exposed one responsive composition
defect rather than a new visual direction: the full saved-prompt list set the
height of the workspace, square library actions were distributed as unrelated
columns and could overlap in the 240px rail, and Theme, Balance and Key differed
slightly in rendered height.

The repair bounds the library to the viewport and gives its prompt list an
independent touch-scroll region with no visible scrollbar. The prompt editor is
capped on narrow screens. Header/library actions are grouped; the 240px rail
uses two compact rows while the 310px rail keeps one row. All square library
actions become 30px with 14px glyphs on mobile, and Theme, Balance and Key now
share an exact 30px utility height. The apparently malformed combo icon was two
buttons overlapping; separation fixed it without replacing the icon language.

Live inspection measured a 506px library with a 327px viewport over 2511px of
prompt content, hidden scrollbar, `pan-y` touch behavior, a 283px editor, no
control overlap or horizontal overflow, and no browser errors. TypeScript,
production build and 68 files / 524 tests passed; lint remains at zero errors
and four inherited warnings. Desktop library geometry and workflows remain
unchanged. Promotion and publication remain human gates.

## Human follow-up: media domains and dark-signal comparison

The operator's annotated review retained the new structure, motion and glass
material, then isolated three final composition defects: image and video tools
still read as one flat launcher, the library did not reveal a corresponding
image/video collection state, and Quiet Signal used too many selected colours.
RAMS also needed an orange Image/Video state because its prior blue selection
was too quiet against pale frost glass.

The repaired header now centers a distinct two-part Image/Video instrument and
keeps Theme, Balance and Key on one compact right-hand plane. Selecting Image
shows Generate, Erase, Outpaint, Deblur, VTO and Glyphs; selecting Video shows
same-width, left-aligned FLUX 3 and Upscale controls. The expanded library
switches to Image Prompts or Video Prompts, while the collapsed rail repeats the
same state with bare 18px Image/Film glyphs. No route, queue, API or MCP contract
changed, and the FLUX 3/Upscale endpoint labels were intentionally removed only
from the visible workspace headers.

Quiet Signal and BFL Stone now form a controlled comparison: identical
near-black graphite/stone surfaces, with one lime family in Quiet Signal and
one BFL-green family in BFL Stone. Unselected tool tabs remain graphite; only
the active state receives the theme signal. Lite Quiet Signal · RAMS keeps its
frost-grey/white material and uses orange for the media selector.

Visual verification used the supplied 21 August header sketch and a normalized
side-by-side review frame. Desktop checks confirmed tool/library synchronization,
left-aligned video controls, overlay stacking and the exact Key status copy.
Narrow checks measured `clientWidth: 410px`, `scrollWidth: 410px`, a 387px shell
and a 387px FLUX 3 workspace; collapsed rail icons measured 18×18px. The preview
was restarted after production build artifacts so all interactions were tested
against clean development chunks; no new browser errors or warnings followed.

Verification: `npm test` passed 69 files / 527 tests; `npx tsc --noEmit` passed;
`npm run build` passed; lint reports zero errors and four inherited warnings;
`git diff --check` passed. Paid inference, credentials and remote state were not
mutated. Final palette preference and publication remain human gates.

### Quiet Signal luminance correction

The human palette gate rejected the initial unified lime as too yellow and
glowy, especially on Generate. The correction returns to Koshi's authored Lime
signal (`#A8BE5C`, strong `#C0D672`) and removes the active-tab halo, raised
selection shadow and text glow. Generate now reads as a flat blackstone control
with an 8% lime fill and restrained border. The media selector and rail keep a
contained lime signal glow. The ambient lime shader is reduced to 24% opacity.
BFL Stone and RAMS are frozen. Live inspection confirms the active Generate
shadow computes to `none`.

## Human follow-up: active tools and panel grain

The operator retained the glow on the Image/Video selector and its rail icons,
particularly in BFL Stone, but rejected the raised white/black/accent shade on
Generate and the other selected workspace tools. The selected tool treatment is
now flat across all themes. Quiet Signal and BFL Stone intentionally keep the
cool-blue intelligence wash on image-tool control panels as a secondary signal.

The visible vertical gallery/panel stripe was replaced with sparse,
non-directional graphite speckle. RAMS now carries orange into the FLUX 3 empty
viewer and header icon, and Image/Video domain changes use a subtle 180ms
reduced-motion-safe entrance.

Live browser evidence:

- BFL Stone Erase: `background-image: none`; `box-shadow: none`.
- BFL Stone Image: green inset signal retained.
- Dark image-tool controls: cyan wash retained consistently.
- RAMS Video and both FLUX 3 identity icons: orange.
- Assets Library: no `repeating-linear-gradient` in its computed panel material.
- Browser diagnostics: no warning or error entries after the repair.

Verification: TypeScript passed; 69 files / 527 tests passed; production build
passed; lint has zero errors and four inherited warnings; diff whitespace
passed. Current visual verdict: awaiting the operator's final comparison.

### RAMS inactive-tool correction

The operator accepted the dimensional inactive controls in every dark theme
but found their near-black lower gradient too heavy on Lite Quiet Signal · RAMS.
Only RAMS now renders inactive workspace tools as flat pale grey with no box or
text shadow. The selected orange state is frozen. Live computed inspection of
Generate/Erase reports no background image and no shadow; selected Outpaint is
unchanged.

## Component-system normalization

The accepted selector differences are now explicit variants of one local
primitive: `tabs`, `segmented`, `raised` and `icon-rail`. Workspace/dashboard
launchers, Image/Video, both prompt preset groups and the collapsed library rail
all render through `SelectorGroup` / `SelectorOption` without changing their
appearance. The shared primitive owns active and accessibility state; theme CSS
continues to own material and signal. Live DOM inspection confirmed all four
variant markers and produced no new browser warning or error. TypeScript,
70 files / 529 tests and the production build pass.

## Human follow-up: persistent FLUX 3 intent

The operator judged the combined surface definite progress and asked for two
small state corrections rather than another navigation redesign. Reflective
remains the first-run theme, while a valid selected theme is already restored
from local storage. FLUX 3 now stores its last Text/Images/Continue source mode
in the existing dashboard workspace cache, so switching to Upscale and back no
longer resets the operation to Text.

Image intent now travels with the image: adding keyframes in FLUX 3 selects
Images, and sending an Asset as a FLUX 3 keyframe opens Video → FLUX 3 → Images
before scrolling to the workspace. Text, Images and Continue remain internal
source selectors because they share the same FLUX 3 endpoint, queue, pricing and
output lifecycle. Upscale remains a separate top-level operation. Future Omni
or Edit modes should be promoted only when they introduce a distinct real
workflow, not in anticipation of one.

Lite Quiet Signal · RAMS also received a scoped consistency fix: Erase no longer
inherits the cyan side-panel wash that the operator retained in the dark stone
themes. Live computed inspection confirmed that RAMS Erase and Outpaint now use
identical panel backgrounds.

Verification: TypeScript passed; 71 files / 532 tests passed; production build
passed; lint reports zero errors and four inherited warnings; diff whitespace
passed. Live checks verified Images → Upscale → FLUX 3 retention, Asset send →
Images routing, theme and source-mode recovery after reload, and no browser
warning or error in the clean preview. No API, MCP, paid inference, credential
or remote state changed.
