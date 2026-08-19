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
- Generate, Erase, Outpaint, FLUX.3 and Assets states were exercised with no
  final browser warnings or errors.

## Human review and repair

The first-pass candidate received a human verdict of `repair`. The review found
that the BFL structure and Holodeck textures/colour signals survived, while the
ambient shader, square geometry and panel-scale liveliness did not survive the
move to a complete application. Oversized pills, the standalone Balance row,
nested API/reference fields, detached reference roles, mobile density and
overscaled FLUX.3 controls were the bounded defects.

The selected second-pass direction is one continuous glossy repair: restrained
coloured shader behind translucent panels, blockier navigation, compact header
utilities, references composed with the prompt, flatter library internals,
cyan Erase/queue states and a collapsed mobile library. BFL nouns, behaviours,
API routes, queue semantics and all generation modes remain frozen.

Rejected alternatives were an exact full-strength source shader, a second
static template round, theme-system work, new FLUX.3/video-edit modes and a new
animation dependency. Those either fit isolated panels poorly or exceed the
one-repair stop rule.

Second-pass verification repeats the green baseline: 64 files and 494 tests,
production build, zero lint errors with four pre-existing warnings, and clean
diff whitespace. Automated browser reinspection was blocked by the browser URL
security policy for the already-open localhost page, so the repaired candidate
remains `awaiting-review` at the final human desktop/mobile gate. No paid
generation, credential mutation, remote push or publication occurred.
