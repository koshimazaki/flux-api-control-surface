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

The candidate remains `awaiting-review`. Human first-impression feedback is the
next gate; only the human may keep, repair or kill the child.
