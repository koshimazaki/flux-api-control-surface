# Audio-Reactive Shader Eval

Controlled comparison for testing whether shader/video guidance improves image-to-video timing over text scheduling alone.

## Positioning Read

This experiment is the proof surface for the repo's
[audio-driven positioning](../../../POSITIONING.md): audio is the timeline, the
shader guide turns that timeline into visible motion, and BFL/FLUX images
provide precise visual anchors for the video model.

The key lesson so far is that direct audio references can be ignored, stretched,
or reinterpreted, while shader-as-video guidance gives Seedance/Kling-style
models a visual timing carrier they can follow without copying the shader look.
That makes the workflow more distinctive than a standard prompt/image-to-video
pass with music added afterward.

For public demos, frame this as early proof of audio-authored video workflows:
BFL/FLUX image anchors + audio-reactive shader guide + image-to-video
interpolation.

## Locked Inputs

- Audio: `AI3-remix2.wav`
- Audio duration: `8.22s`
- Render duration: `9.00s` for overflow / trimming safety.
- 9s shader/video guide candidate for `@vid1`: `../../../Audio reactive shader/exports/ghostblob-audio-reactive-2026-05-30T20-52-06-627Z-9s.mp4`
- Image references: use the same three selected BFL/FLUX botanical images for every variant.
- Subject: cybernetic macro botanical specimen, top-down / bird's-eye macro view.
- Product-object extension: use the `audio_reactive_objects` prompt library when testing mundane objects as audio-reactive product transformations.
- Output: one continuous 9.00 second video. The measured prompt schedule ends at 8.22s; keep 8.22-9.00s as a final hold/settle tail on the last image.
- Keep model, resolution, seed, camera ratio, and reference-image order fixed where the provider allows it.
- Unless noted otherwise, Seedance outputs in this eval are Seedance 2.0 at 1080. `D2` is the exception: Seedance 2.0 Fast 720p.
- Freepik shot durations are integer-only, so approximate the original `3.80s` / `5.90s` transition points with `4s` / `6s` cuts when using the shot interface.
- For `B1`, use the exact `8.22s` audio length if the audio reference is the length anchor.

## Variant Order

1. `A1` - Scheduled morph baseline, no shader guide, no audio-analysis wording.
2. `A2` - Scheduled 3-shot baseline, no shader guide, no audio-analysis wording. Shot durations: 4s / 2s / 3s.
3. `A3` - Freepik/Seedance 3-shot prompt record, no audio and no video guide. Separate Kling WAV/audio-reference branch blocked in this setup.
4. `B1` - Same as `A1`, but with Seedance 2.0 audio reference attached.
5. `B2` - Same as `A2`, but with Seedance 2.0 audio reference attached.
6. `B3` - Audio-analysis prompt, no shader guide.
7. `C1` / `C` - Same as `A1`, but with shader/video guide referenced as `@vid1`.
8. `C2` - Same as `A2`, but with shader/video guide referenced as `@vid1`.
9. `C3` - Alternate Seedance 2.0 guided `@vid1` output, cut/edited and used mainly in the final public piece.
10. `D` - `@vid1` driver with loose start/middle/end image anchors, no exact timestamp schedule.
11. `D1` - Single FLUX init image per shot + prompt-only animation/interpolation in Kling Omni with Shots. No shader/video guide.
12. `D2` - Single FLUX init image per shot + prompt-only animation/interpolation in Seedance 2.0 Fast 720p. No shader/video guide.
13. `E` - Scheduled text + new shader guide.
14. `F` - Audio-reactive prompt + new shader guide.
15. `G` - Optional exaggerated shader guide stress test.
16. `K` - Kling-specific non-human short prompt batch (`kling-nonhuman-short-prompts.md`).

## Scoring

Score each output from 1-5:

- Transition timing at `3.80s` and `5.90s`
- For `A2`, cut/shot timing at `4.00s` and `6.00s`
- Subject identity preservation
- Motion clarity
- Beat/audio feel. Mark as `0` when the model appears to ignore the audio reference entirely.
- Audio fidelity. Mark when the model changes, stretches, remixes, or otherwise reinterprets the audio instead of preserving the attached track.
- Sharpness/coherence
- Manual editing needed
- Visual-guide fidelity. For shader/video variants, score whether motion follows `@vid1` without copying shader graphics.

## Run Notes

- `A1` actual prompt used was documented as `variant-a1-freepik-morph-used.md`.
- `A2` actual 3-shot prompt chunks were documented as `variant-a2-freepik-3shot-used.md`.
- `A3` records the Freepik/Seedance no-audio/no-video sequence prompt. It is useful as a shot-control record and still part of the Seedance shot-baseline family; the separate Kling WAV/audio-reference branch was blocked in this setup.
- `B1` first run: visually, Seedance 2.0 did not create a meaningful audio-reactive result. Motion looked like generic zoom/push-in with no clear response to beats or impacts. The audio may also have been altered/reinterpreted, but less noticeably than in B2.
- `B1` second run prompt used explicit media tokens: `@audio1`, `@img1`, `@img2`, `@img3`. This tests whether direct token binding improves audio reference compliance.
- `B2` separate-shot audio version is the next run, using the same explicit token style and 4s / 2s / 3s shots.
- `B2` separate-shot audio run: Seedance 2.0 appeared to try using the audio, but modified or reinterpreted the audio and synced motion to that modified version instead of the original track. Result: more obviously audio-aware than B1, but still not reliably audio-reactive and less useful than the shader-with-audio workflow.
- `B2` second-attempt prompt was documented as `variant-b2-freepik-audio-sequence-attempt2-used.md`; it used per-shot Freepik chunks with repeated global `@audio1` instructions and original continuous timeline ranges inside the chunks.
- `C1` actual full-prompt shader-video run was documented as `variant-c1-freepik-shader-video-morph-used.md`.
- `C2` actual shot-chunk shader-video run was documented as `variant-c2-freepik-shader-video-sequence-used.md`.
- `C3` is an alternate guided Seedance 2.0 output using the `@vid1` guidance family. It was cut/edited and used mainly in the final public piece, so treat it as production-use evidence rather than a clean untouched eval output.
- `D` removes exact timecodes to test whether schedule text was overriding audio/video guidance. It uses `@vid1` as the primary driver and image anchors only as start / middle / end states.
- `D1` and `D2` are a different eval axis: one FLUX init image at a time, then prompt-only animation/interpolation in the video model. They test how much motion, continuity, rhythm, and morphing Kling Omni with Shots and Seedance 2.0 Fast infer from similar prompt language without a shader/video guide. Mapping: `D1 = Kling Omni with Shots`, `D2 = Seedance 2.0 Fast 720p`.
- Do not treat `D1` / `D2` as the main audio-reactive comparison. They are a prompt-only model-quality baseline: useful for seeing how the two video models animate FLUX stills without an actual audio or video motion driver.
- Early read: shader-as-video guidance appears more useful than direct audio reference. Even gentle shader motion may help because the model receives a visual timing/motion carrier plus image references as dual guidance. Next shader-video prompts refer to this guide as `@vid1` and ask the model to follow its motion and embedded audio for rhythm/transitions.
- Kling-specific shorter prompts are tracked in `kling-nonhuman-short-prompts.md`; theme is non-human subjects and motion/camera reference from `@vid1`.

## Output Files

Current local staging folder: `outputs/audio-reactive-shader-eval/`.

R2 has published/staged copies of the outputs, but canonical R2 URLs still need to be added here when available.

| Variant | Local file | Model | Metadata |
|---|---|---|---|
| `C1` | `C1-magnific_style-cinematic-macro-nat_SOa36SkUb8.mp4` | Seedance 2.0, 1080 | H.264 + AAC, 1440x1440, 24fps, 14.07s, 17M |
| `C2` | `C2-magnific_style-cinematic-macro-nat_1sXfpcNr4r.mp4` | Seedance 2.0, 1080 | H.264 + AAC, 1440x1440, 24fps, 14.07s, 20M |
| `C3` | `C3-magnific_use-motion-of-the-vid1-moving-in-and-out-and-style_seedance_1080p_1-1_24fps_38533.mp4` | Seedance 2.0, 1080 | H.264 + AAC, 1440x1440, 24fps, 12.05s, 12M |
| `D1` | `D-1-kling-magnific_create-a-video_kling_1080p_1-1_24fps_27063.mp4` | Kling Omni with Shots | H.264, 1440x1440, 24fps, 11.04s, 24M |
| `D2` | `D-2-magnific_create-a-video_seedance_720p_1-1_24fps_27064.mp4` | Seedance 2.0 Fast 720p | H.264 + AAC, 960x960, 24fps, 14.07s, 7.9M |

Prompt records:

- `variant-d1-kling-omni-shots-prompt-only-sequence-used.md`
- `variant-d2-seedance-prompt-only-shot-sequence-used.md`
- `variant-c3-seedance-guided-final-cut-used.md`

## Next Storyboard Batch

Before publishing a tutorial, batch a few short proof videos that make the method
obvious and timestamp the workflow.

Recommended route:

- build a 15s audio-first timeline with 8-9 markers;
- generate 9 BFL/FLUX anchor images for the planned object states;
- render a shader/control video from the same audio timeline;
- produce two clips rather than one long clip: anchors 1-5, then anchors 5-9;
- overlap anchor 5 so the cut point preserves continuity;
- evaluate whether transitions hit the markers and whether the model follows the
  shader motion without copying abstract graphics.

Commercial storyboard example: a clean furniture-ad style sequence where a
bottle becomes a vase, the vase unfolds into a stool, the stool becomes a side
table, and the table grows a lamp/shelf/accessory. The important point is not
the exact product category; it is that each transformation is authored by the
audio timeline and made controllable through multiple BFL/FLUX anchors.
