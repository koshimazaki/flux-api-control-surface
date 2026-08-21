# MORPHKIT handoff: Holodeck × FLUX API Control Surface

Case id: `bfl-holodeck-control-surface-v1`

This is an opportunity-linked product morph. The BFL Product Engineer role
selects the proof gap; MORPHKIT governs the design transfer and evidence.

## Parent roles

| Parent | Transfer roles | Exact revision |
|---|---|---|
| Holodeck operator panels | style, interface, material | `koshimazaki/Holodeck` local `bef5668` |
| FLUX API Control Surface | structure, behaviour, identity | `koshimazaki/flux-api-control-surface` `5fec960` |

AK Media Lab HiFi World Studio is supporting visual context only. Its brand and
product shell are not parents in this case.

## Holds

- Keep every BFL mode, task, domain noun, queue, asset, API/MCP and evaluation
  behaviour intact.
- Transfer the exact Holodeck Cyberpunk V2 colours, fonts, radii, panel
  materials, compact labels, raised controls and recessed readouts.
- Do not leak Audio, Camera, World Capture or AK Media Lab product semantics.
- Do not invoke paid generation or mutate credentials to prove the interface.

## Implementation map

- `app/styles/holodeck-design-system.css`: scoped source tokens, typography and
  material primitives.
- `app/styles/holodeck-morph.css`: target adapter across the existing BFL
  component anatomy.
- `app/page.tsx`: one scoped `.dsgn-root` and theme boundary.
- `design-qa.md`: source/child comparison, interactions and verification.

## Verification

- `npm test`: 64 files, 494 tests passed.
- `npm run build`: passed.
- `npm run lint`: zero errors; four pre-existing warnings remain.
- Generate, Erase, Outpaint, FLUX 3 and Assets states were exercised with no
  final browser warnings or errors.

## Human review and repair

The first-pass candidate received a human verdict of `repair`. The review found
that the BFL structure and Holodeck textures/colour signals survived, while the
ambient shader, square geometry and panel-scale liveliness did not survive the
move to a complete application. Oversized pills, the standalone Balance row,
nested API/reference fields, detached reference roles, mobile density and
overscaled FLUX 3 controls were the bounded defects.

The selected second-pass direction is one continuous glossy repair: restrained
coloured shader behind translucent panels, blockier navigation, compact header
utilities, references composed with the prompt, flatter library internals,
cyan Erase/queue states and a collapsed mobile library. BFL nouns, behaviours,
API routes, queue semantics and all generation modes remain frozen.

Rejected alternatives were an exact full-strength source shader, a second
static template round, theme-system work, new FLUX 3/video-edit modes and a new
animation dependency. Those either fit isolated panels poorly or exceed the
one-repair stop rule.

Second-pass verification repeats the green baseline: 64 files and 494 tests,
production build, zero lint errors with four pre-existing warnings, and clean
diff whitespace. Automated browser reinspection was blocked by the browser URL
security policy for the already-open localhost page, so the repaired candidate
remains `awaiting-review` at the final human desktop/mobile gate. No paid
generation, credential mutation, remote push or publication occurred.

## Linked case: BFL Reflective Theme Morph

Case id: `bfl-reflective-theme-morph-v1`

This is a linked repair candidate, not a mutation of the sealed first case.
The accepted implementation at `9699554` supplies BFL structure, behaviour,
identity and the repaired Holodeck material baseline. Quiet Signal supplies the
theme-picker and stable-field-instrument constraints from MORPHKIT repository
HEAD `9d80b7c443c5a9ca83750c2f66ab1b376764d0be` (last commit affecting the
source pack: `709392314fb85f80bccec4daa29118b64b1f6a2e`). Its SIDKIT and Koshi Lab
parents remain explicitly `observed`; this candidate therefore borrows the
theme orchestration contract, not a claim of promoted visual canon.

The cloud maintenance commit `f5510a86262bdd8cba7aecd096a5f9b1c6446ace`
is a supporting correctness input with no visual-parent role.

### Trait accounting

| Outcome | Traits |
|---|---|
| Survived | BFL workflows and nouns; repaired prompt/reference structure; shader responsiveness; Holodeck technical type, panel geometry and signal hierarchy; existing subtle animations |
| Partial | Holodeck Cyberpunk V2 remains the Reflective default, but material opacity and specular response were adapted for a full application rather than copied from isolated panels |
| Lost | The previous single fixed material ground and one-colour preset selection; the header-expanding API-key row |
| Novel | Persistent three-ground comparison; compact theme/Balance/Keychain instrument line; role-coloured look presets; explicit FLUX 3 video header mark |

Defect → repair: insufficient reflection and shade visibility became shared
glass tokens plus a stronger restrained field; oversized header utilities
became one-line instruments with anchored overlays; green-only preset states
became semantic violet/amber/cyan selections; inconsistent FLUX 3 mode identity
became one repeated icon/text grid.

Rejected alternatives were a wholesale RAMS repaint, complete merge of the
stale outer theme branch, new FLUX 3 modes, and decorative fake telemetry.

Verification is 66 test files / 514 tests, production build, zero lint errors
with four inherited warnings, clean diff whitespace and a local HTTP 200
preview. Promotion remains `awaiting-review`; browser automation could not
cross its localhost URL policy, and no push or publication occurred.

### Human-reviewed shell normalization

The next human review kept the linked theme direction but requested one small
shell-consistency repair. The theme and Keychain menus now inherit a topbar
stacking context above the workspace, Generate's two preset groups are centered
with tighter icon spacing, and Create video's `PanelHeader` now carries the same
corner identity gesture as the other tool panels.

FLUX 3 was verified to use the exact shared `TabButtonBar` implementation; no
duplicate tab component existed. Its later hard-coded inner gap and panel
padding were normalized to the shared Holodeck spacing token so selecting the
mode no longer introduces a separate rhythm. The user's Audio observation was
recorded as accepted without code change.

Mechanical verification remains green at 66 test files / 514 tests, successful
production build, zero lint errors with four inherited warnings, clean diff
whitespace, and HTTP 200 for the preview and queue endpoint. The result remains
local and `awaiting-review` until the final visual verdict.

### Human-reviewed gallery stability normalization

The following review retained the Reflective theme but identified a partial
survival defect at application scale: FLUX 3's special grid read as a zoom,
gallery grain became visible striping, and missing legacy media plus a continuous
shader overloaded scroll. The repair preserves every BFL workflow, theme token,
panel identity and mobile breakpoint while normalizing FLUX 3 to the shared rail
and control width, clearing only the asset-library material, pausing the shader
during scroll, and adding shared/negative output-image caching with a stable
missing-media placeholder.

Trait update: the reflective shade and other panel materials survive; the
striped gallery grain is intentionally lost; full-height gallery backdrop blur
is lost for scroll stability; a clear gallery ground, lazy media decoding and a
session failure cache are novel. Rejected alternatives were globally flattening
all panels, increasing cache size without addressing repeated filesystem scans,
or restoring deleted image files from an unverified remote source. Verification
is 66 test files / 515 tests, successful production build, zero lint errors with
four inherited warnings, clean diff whitespace and local HTTP checks. Promotion
remains `awaiting-review`; no paid inference, push or publication occurred.

### Quiet Signal RAMS + FLUX 3 Video Upscale capability pass

The operator accepted the gallery-stability checkpoint as good progress and
then requested a bounded product-capability iteration: preserve the existing
Reflective/Frozen/Quiet Signal grounds, add the frost-grey/white RAMS ground as
a recoverable preset, normalize every visible `FLUX 3` brand string, remove the
misleading local-runtime badge, and expose BFL's newly documented Video Upscale
tool as a first-class workspace and MCP operation.

Parent roles remain explicit. BFL owns structure, product nouns, queue and
output behaviour. Quiet Signal's `sidkit-grey` RAMS palette owns only the new
material ground: `#B8B8B8`, `#D4D4D4`, `#E6E6E6`, orange action `#FF9F43`,
cyan intelligence `#62C4E6`, and dark-neutral text/lines. Official BFL Video
Upscale documentation is supporting product/API evidence, not a visual parent.

Trait accounting:

| Outcome | Traits |
|---|---|
| Survived | BFL mode anatomy, equal tab spacing, server queue, API-key and Balance behaviour, FLUX 3 generation, Assets, evaluation records, responsive breakpoints, existing three theme grounds |
| Partial | RAMS uses the exact source palette and signal roles, while glass opacity and shader brightness are adapted to retain readability across a full application |
| Lost | The misleading local-runtime claim; the former dotted video-brand spelling; gallery-header horizontal overflow on narrow screens |
| Novel | Lite Quiet Signal · RAMS theme; real FLUX 3 Video Upscale queue adapter; saved source/result pair; accessible before/after video fader; MCP/CLI parity; Assets/evaluation recovery |

Defect → repair: the RAMS source previously had no BFL target became a fourth
token-controlled surface; the only missing documented FLUX Tool became an
Upscale workspace using `flux-tools/video-upscale-v1`; mobile Assets actions
that widened the page now stack and contain their filter rail. The source clip
is saved beside the result so the fader remains durable after reload.

Rejected alternatives: replacing the default Reflective ground, folding
Upscale into FLUX 3's generation modes, exposing a decorative tab without API
and queue support, loading new media into a speculative browser cache, or
calling paid inference for visual QA. These either erase the accepted child,
blur distinct provider operations, or exceed the local verification boundary.

Verification: 68 test files / 524 tests passed; TypeScript passed; production
build passed; lint has zero errors and four inherited warnings. Live desktop
and narrow-viewport inspection verified equal tab widths, stable FLUX 3 column
geometry, theme and Key popovers above the workspace, RAMS contrast, Upscale
content, and removal of horizontal page overflow. No paid inference, key
mutation, remote push or publication occurred. The exact FLUX 3 Video Upscale
result quality remains a black-box boundary until the operator elects to spend
on a real job; visual promotion remains a human gate.

### Narrow Prompt Library survival repair

The next human gate retained the full visual child and isolated a scale defect
in the Prompt Library. Survived: palette/theme grounds, panel material, prompt
records, combo actions, editor/reference structure and every BFL workflow.
Partial: the desktop library rail becomes a bounded viewport at ≤1160px and its
actions reflow from one row to two only while the rail is 240px. Lost: visible
prompt-list scrollbar, unbounded list-driven workspace height and distributed
single-button columns. Novel: quiet touch scrolling and one 30px utility rhythm
shared by Theme, Balance and Key.

Defect → repair: the 42-record list stretched its grid row; it now scrolls
inside a 68dvh/640px bound. Settings and Combine overlapped in the side rail;
semantic action groups and a two-row intermediate breakpoint keep every square
separate. Rejected alternatives were truncating the prompt collection, hiding
the library by default, or globally shrinking all controls. Live inspection
found no overlap, horizontal overflow or browser errors; TypeScript, production
build and 68 files / 524 tests passed, with zero lint errors and four inherited
warnings. The result remains local and `awaiting-review`.
