# Fable Review Brief: Seedance + R3F Avatars

Please review this plan as a creative/technical production workflow, not as a
shipping software PRD.

## What We Are Testing

We want to create short Seedance 2.0 action videos where Koda-style prompting is
combined with our own React Three Fiber camera/audio guide.

The question:

```text
Can @video1 and @audio1 make visually strong prompt-generated action more
intentional, repeatable, beat-synced, and useful as demo or IC LoRA material?
```

## First Track

Treat this as an Avatars project first.

Generate a few strong avatar/reference sheets, then run video tests only on the
best one or two:

- realistic storm-field researcher;
- tailored impact athlete;
- melted toy automaton or studio twin creature.

Use prompt morphs/hybrids on stills and template-grid sheets before spending
video credits. The goal is to discover stronger character/world combinations,
not to morph every axis inside the final video prompt.

## Four Core Video Tests

| Variant | Inputs | What It Tests |
|---|---|---|
| `K1-storyboard-native` | storyboard + character refs + detailed beat prompt | Big detailed Koda storyboard method. |
| `K2-storyboard-r3f-hybrid` | storyboard + character refs + `@video1` + `@audio1` | Whether the detailed method obeys authored R3F camera/audio. |
| `K3-preset-native` | character sheet + one-line action + ink-brush cinematic 3D preset | Simple Koda-style visual preset. |
| `K4-preset-r3f-hybrid` | character sheet + preset + `@video1` + `@audio1` | Whether the simple preset keeps its energy while following our camera/audio. |

Optional ablation:

- `K1b-detailed-no-storyboard`: same detailed prompt, no storyboard, to isolate
  whether the storyboard mainly controls beats, environment, pose, composition,
  or medium bias.

## R3F Guide

`@video1` should show:

1. a 180-degree side orbit around the avatar/fight;
2. a low/body-level pass;
3. a crane from low angle into overhead;
4. an audio-reactive tornado/shader field pulsing to the same beat markers as
   `@audio1`.

`@audio1` should be the real music track, not generated SFX.

## Storyboard Lesson

3D storyboards appear to bias Seedance toward 3D-looking outputs. Use 3D/clay
storyboards for realistic, cinematic 3D, or photoreal work. Use 2D storyboards
only when the desired output is flat anime/2D.

The storyboard may be most useful for environment, pose, framing, composition,
and scene geography. A detailed prompt alone may already carry action beats.

## Feedback Requested

- Is Avatars the right first container, or should the first pack be split into
  human and creature tracks?
- Should prompt morphing happen only for still references, or also in the video
  prompt?
- Should `@video1` be abstract proxy geometry, clay previs, or visually closer
  to the final style?
- Is the four-run matrix enough to learn something, or does it need one more
  ablation?
- Which avatar direction feels most ownable and least generic?
- What are we missing before spending video credits?
