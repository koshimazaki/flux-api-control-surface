# Mini PRD: Seedance + R3F Action Video Tests

Status: working plan  
Date: 2026-07-05  
Scope: short video-generation tests for Koda-style Seedance prompting plus BFL/R3F
camera and audio guidance.

## Summary

We want to test whether Koda-style Seedance workflows can produce cinematic
action clips that are not only cool, but repeatably controllable.

The project compares two Koda-derived approaches:

1. a detailed storyboard/beat-board method;
2. a simple character-sheet plus visual-preset method.

Each approach gets a native prompt-only version and a hybrid version using our
React Three Fiber guide video plus real music/audio.

The core question:

```text
Does @video1 + @audio1 make the same style of generation more intentional,
repeatable, beat-synced, and useful for IC LoRA/demo material?
```

## External Prompting Lessons

Recent Koda/Seedance experiments suggest a few storyboard behaviors worth
testing instead of assuming:

- Storyboard medium biases final medium. 3D storyboards appear to push even
  2D-intended outputs toward a 3D look. Use 3D/clay/previs boards for realistic,
  cinematic 3D, or photoreal outputs. Use 2D boards for flat anime/2D outputs.
- Detailed prompts can carry action beats even without an attached storyboard.
  The storyboard may be more important for environment, pose, framing, and
  composition than for the beat list itself.
- Storyboards seem strongest when the desired outcome depends on matching a
  specific world, camera angle, body pose, or scene geography.
- If the prompt is already very detailed, attaching a storyboard can act less
  like "tell the story" and more like "lock the set, composition, and poses."

Implication for this PRD: use 3D storyboards when we want realistic/3D action
and use 2D boards only if we intentionally test a flat anime output. For the
ink-brush cinematic 3D preset, a 3D board is acceptable if we want dimensional
feature-film depth, but risky if the goal becomes pure 2D anime.

## Hypothesis

Prompt-only Seedance can generate beautiful action, but the exact camera path,
gesture timing, and audio-reactive environment may vary heavily between runs.

An R3F guide video should improve control because it gives the model a visible
motion carrier:

- authored 180-degree side orbit;
- low/body-level camera pass;
- crane from low angle into overhead;
- audio-reactive tornado or shader pulses that already move to the music.

The existing template-grid UI can add lightweight addressability for character
sheets, gesture sheets, environment boards, and storyboard panels without
turning this into a large new software build.

## Goals

- Compare prompt-only style freedom against R3F-guided control.
- Test whether a real `@audio1` music reference plus visible R3F beat motion
  improves timing.
- Produce usable clips for demo reels and possible IC LoRA training.
- Learn which subject class is most reliable: realistic human, anime fighter,
  mecha/creature, flowers, or underwater organisms.
- Keep the workflow fast enough to spend generation credits on outputs, not on
  tooling.

## Non-Goals

- Do not build a new heavy sprite-sheet generator before these tests.
- Do not require perfect martial choreography in the first pass.
- Do not train a LoRA from the first batch before scoring output quality.
- Do not depend on protected franchise names or branded references in final
  prompts. Use generic descriptive language instead.

## Core Inputs

- `@character` or `@char1` / `@char2`: character sheet, creature sheet, or
  cropped template-grid references.
- `@storyboard`: detailed or simplified storyboard sheet.
- `@video1`: R3F guide video with camera path, tornado/shader, and visible beat
  pulses.
- `@audio1`: real music track, such as techno or drum and bass.
- Optional named crops from the existing template grid, such as
  `gesture/kick`, `environment/tornado-hall`, or `storyboard/P05`.

## Method A: Detailed Storyboard Blueprint

This is the larger Koda-style approach.

Use a clay/previs storyboard as the spatial blueprint. The storyboard locks:

- camera angle;
- shot scale;
- screen direction;
- character positions;
- contact points;
- effect origins;
- environment geography.

Native version:

- feed the storyboard and character references;
- ask Seedance to recreate the board shot-for-shot;
- allow cuts if the source board is a cut list.

R3F hybrid version:

- feed the storyboard plus `@video1` and `@audio1`;
- tell Seedance the storyboard is a set of sampled keyframes along one camera
  path, not necessarily a hard-cut sequence;
- use `@video1` as the authority for camera and tornado timing.

Prompt rule:

```text
The storyboard is a continuous camera-path board, not only a cut list. Treat
each panel as a sampled keyframe from one authored camera move when @video1 is
provided. Preserve the same bodies, environment, tornado, and geography.
```

Good for:

- precise fight beats;
- reusable panels;
- multi-character staging;
- clean per-panel evaluation.

Risk:

- over-constraining the generation;
- the model may add hard cuts even when we want continuity;
- two realistic fighters plus camera plus tornado may be too much at once.
- a 3D storyboard may push the final look toward 3D even when the style prompt
  asks for 2D/anime qualities.

## Method B: Prompt-Only Visual Preset

This is the simpler Koda-style approach.

Use a character sheet, a one-line action description, and a strong visual
preset. The prompt does most of the directing.

Reference direction:

- high-end cinematic 3D;
- fast anime/sakuga sword or martial motion;
- expressive ink-brush effects as the primary action language;
- sumi-e trails, ink splashes, calligraphic energy, extreme perspective,
  haze, and feature-film rendering.

Baseline prompt shape:

```text
A mesmerizing display of @character's masterful swordsmanship.
Use high-end cinematic 3D realism fused with expressive ink-brush anime action.
Every movement creates sumi-e trails, ink splashes, calligraphic energy,
dynamic black brush strokes, explosive ink bursts, dramatic foreshortening,
cinematic tracking, volumetric haze, and realistic material depth.
```

Good for:

- fast iteration;
- style exploration;
- strong motion surprises;
- character-sheet-driven animation.

Risk:

- choreography may be beautiful but not intentional;
- camera path may change each run;
- generated audio may behave as SFX rather than following our track;
- outputs may be harder to compare.

## Method C: Existing Template-Grid Layer

Use the already-tested template-grid UI for prompt-generated sheets and boards.
This is not a new large UI project. It is a lightweight control layer.

The grid can organize:

- fixed character views;
- gesture studies;
- expression or material details;
- environment/world panels;
- action/storyboard panels.

Why it matters:

- named sections are easier for agents to reference;
- crops can be reused or upscaled;
- gestures and environments can be varied independently;
- training datasets can be cleaned more easily later.

Example handles:

```text
character/front
character/profile
gesture/kick
gesture/block
environment/tornado-hall
storyboard/P05
```

## Method D: R3F-Guided Hybrid Overlay

This is our contribution on top of the Koda methods.

Use `@video1` as the director:

1. 180-degree side orbit around the fighter or fighters;
2. low/body-level pass near the action;
3. crane from low angle into overhead;
4. final overhead view where the tornado becomes readable spiral geometry.

Use `@audio1` as the real music timeline:

- movements should hit the music;
- major gestures should land on beat markers;
- tornado/shader pulses should follow the track;
- generated audio should not replace the music with unrelated background sound.

Prompt contract:

```text
@video1 is the camera and timing guide. Follow its 180-degree side orbit, then
its low-to-overhead crane. @audio1 is the real music timeline. The fighter's
major gestures, impacts, and the tornado pulses should follow @audio1.
```

## First Test Matrix

| Variant | Inputs | Purpose |
|---|---|---|
| `K1-storyboard-native` | `@storyboard` + character refs + detailed beat prompt | Test the big detailed Koda-style storyboard method. |
| `K2-storyboard-r3f-hybrid` | `@storyboard` + character refs + `@video1` + `@audio1` | Test whether the detailed method obeys our camera/tornado/audio overlay. |
| `K3-preset-native` | character sheet + one-line action + ink-brush visual preset | Test the simple visual-preset method with maximum style freedom. |
| `K4-preset-r3f-hybrid` | character sheet + ink-brush preset + `@video1` + `@audio1` | Test whether the simple preset keeps its energy while following authored motion. |

Optional storyboard ablation:

| Variant | Inputs | Purpose |
|---|---|---|
| `K1b-detailed-no-storyboard` | character refs + same detailed beat prompt, no `@storyboard` | Test whether the detailed prompt alone carries beats, and isolate what the storyboard adds to environment/composition. |

Optional follow-up once the first four are scored:

| Variant | Inputs | Purpose |
|---|---|---|
| `K5-creature-native` | creature grid sheet + one-line action + visual preset | Test deformation-friendly subjects. |
| `K6-creature-r3f-hybrid` | creature grid sheet + `@video1` + `@audio1` | Test whether creature motion gives better audio-reactive LoRA material. |

## Character Slate

Generate character sheets before video runs. Avoid generic ninja-first choices
unless they are useful as a control.

Realistic human/action directions:

- `storm-field researcher`: realistic sci-fi expedition fighter, part weather
  scientist, part desert archaeologist, practical layered field suit, magnetic
  equipment straps, dusty technical fabrics, not sleek cyberpunk. Fighting style
  can mix silat, wing chun trapping, and field-tool improvisation.
- `tailored impact athlete`: luxury tailored suit or football-adjacent training
  silhouette, powerful footwork, close-combat kicks and elbows, realistic
  high-fashion sports energy without becoming a superhero costume.
- `wasteland signal guard`: grounded desert storm guard with respirator or
  scarf hardware, stormproof coat, compact blade or staff movement, designed to
  belong near a tornado.

Creature/mecha directions:

- `melted toy automaton`: deformed designer-toy robot, glossy ceramic/chrome
  shell, softened joints, supernatural internal glow, moving with martial
  precision despite liquified toy-like anatomy.
- `studio twin creatures`: two related creature sheets in a clean studio setup,
  one heavier and grounded, one thin and elastic; both can smear, pulse, or
  deform with the music without reading as broken anatomy.
- `underwater signal organism`: amoeba/eel/snake hybrid with translucent
  membranes, audio-reactive fins, and ribbon-like body language for the
  underwater branch.

Recommended first pair:

1. `storm-field researcher` for the realistic/tornado fight.
2. `melted toy automaton` or `studio twin creatures` for the creature/mecha
   version.

## Run Workflow

Recommended track: treat the first batch as an Avatars project. Start by
finding one strong realistic avatar and one strong creature/mecha avatar, then
use those winners in the Koda/R3F video matrix.

1. Create a small prompt set: 3 avatar concepts, 2 world concepts, 2 motion
   concepts, and 2 visual presets.
2. Use Morph/Hybrid prompt combinations on stills and template-grid sheets to
   discover stronger avatar/world hybrids before spending video credits.
3. Pick one music track and extract beat markers.
4. Render the R3F `@video1` guide from the same beat markers.
5. Generate one or two character/template-grid sheets.
6. Generate a simple world/tornado environment board if needed.
7. Generate the detailed storyboard sheet for Method A, choosing 3D or 2D board
   style to match the desired final medium.
8. Run `K1` through `K4` with the same subject and comparable duration.
9. If budget allows, run `K1b` to isolate whether the storyboard improves
   environment, pose, and composition beyond the detailed prompt.
10. Score the outputs before expanding to creature/flower/underwater variants.
11. Save winning prompts, inputs, outputs, and notes into collections.

## Prompt-Morph Plan

Use morphing before video generation, not as the first expensive video step.
The point is to cheaply search the design space and create better references.

Avatar prompts:

- realistic storm-field researcher;
- tailored impact athlete;
- melted toy automaton or studio twin creature.

World prompts:

- tornado training hall / storm lab;
- clean studio character-sheet environment.

Motion prompts:

- 180-degree side orbit close-combat gesture loop;
- low/body-level pass into crane-up overhead reveal.

Visual presets:

- realistic cinematic 3D;
- ink-brush cinematic 3D.

Recommended morphs:

- `storm-field researcher` x `tailored impact athlete` for a less obvious
  realistic avatar.
- `melted toy automaton` x `studio twin creature` for the creature branch.
- `realistic cinematic 3D` x `ink-brush cinematic 3D` only after the base
  character identity is stable.

Avoid morphing every axis at once. First lock the avatar, then the world, then
the motion/video test.

## Scoring Rubric

Score each output from 1 to 5:

- follows the 180-degree side orbit;
- cranes from low/body level to overhead;
- preserves character identity;
- preserves two-body or one-body geography;
- lands major gestures on `@audio1`;
- makes tornado/shader visibly audio-reactive;
- preserves the intended visual style;
- avoids unwanted hard cuts or camera changes;
- produces useful IC LoRA/demo material.

Mark separately:

- whether audio was preserved, ignored, or reinterpreted;
- whether `@video1` was followed, loosely interpreted, or copied too literally;
- whether `@storyboard` mostly improved beats, environment, pose, composition,
  or final-medium bias;
- whether the output is better as final footage, training material, or only a
  style reference.

## Risks

- Too many constraints may cause weaker motion.
- Realistic human fight choreography may break more than anime or creature
  motion.
- Direct audio reference may be ignored or remixed by the model.
- The model may follow the visual guide but copy the simple guide aesthetic.
- Franchise-like prompts can be distracting or unsafe for final/public usage.
- Two fighters plus tornado plus camera plus music may need to be simplified to
  one fighter for the first controlled test.
- 3D storyboards can accidentally steer a desired 2D/anime output into a 3D
  look; match storyboard medium to intended final medium.

## Useful Additions We May Be Missing

- A one-page run log template for every generation: inputs, prompt, seed/model,
  duration, score, and notes.
- A reference hierarchy in every prompt: `@video1` controls camera/timing,
  `@audio1` controls rhythm, `@character` controls appearance, `@storyboard`
  controls staging.
- A guide-video design rule: make R3F guides visually clear but not too
  beautiful, so the model follows motion without copying placeholder graphics.
- A fallback plan for one-character tests if two-character fights are unstable.
- A negative-style block for each run: no random cuts, no extra characters, no
  unrelated generated music, no unreadable UI text.
- A small crop/export step from the template grid, so named sections can become
  separate references when a provider handles crops better than full sheets.
- A strict asset-naming convention for the first batch:
  `K2_storm-field-researcher_r3f-audio_take01`.
- A budget rule: run low-res/fast drafts first, then spend high-res credits only
  on the variants that score well.
- A storyboard-ablation run using the same detailed prompt with no storyboard,
  so we know whether the board is buying us beats, set design, poses, or
  composition.

## Questions For Fable Review

- Are four first runs enough, or should creature and human be tested in separate
  first packs?
- Should `@video1` be abstract proxy geometry, clay previs, or closer to the
  final visual style?
- Should `@audio1` be actual final music, or a simplified click/beat guide plus
  final music added later?
- Is the detailed storyboard method likely to fight against the continuous R3F
  camera move?
- For our use case, should the storyboard be treated mainly as environment and
  pose control rather than beat control?
- Which subject is most ownable: realistic storm-field human, tailored athlete,
  melted toy automaton, or studio twin creatures?
