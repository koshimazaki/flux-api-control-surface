# Audio-Reactive Shader Eval

Controlled comparison for testing whether shader/video guidance improves image-to-video timing over text scheduling alone.

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
- Freepik shot durations are integer-only, so approximate the original `3.80s` / `5.90s` transition points with `4s` / `6s` cuts when using the shot interface.
- For `B1`, use the exact `8.22s` audio length if the audio reference is the length anchor.

## Variant Order

1. `A1` - Scheduled morph baseline, no shader guide, no audio-analysis wording.
2. `A2` - Scheduled 3-shot baseline, no shader guide, no audio-analysis wording. Shot durations: 4s / 2s / 3s.
3. `A3` - Freepik/Kling 3-shot prompt record, no audio. WAV/audio-reference branch blocked in this setup.
4. `B1` - Same as `A1`, but with Seedance 2.0 audio reference attached.
5. `B2` - Same as `A2`, but with Seedance 2.0 audio reference attached.
6. `B3` - Audio-analysis prompt, no shader guide.
7. `C1` / `C` - Same as `A1`, but with shader/video guide referenced as `@vid1`.
8. `C2` - Same as `A2`, but with shader/video guide referenced as `@vid1`.
9. `D` - `@vid1` driver with loose start/middle/end image anchors, no exact timestamp schedule.
10. `E` - Scheduled text + new shader guide.
11. `F` - Audio-reactive prompt + new shader guide.
12. `G` - Optional exaggerated shader guide stress test.
13. `K` - Kling-specific non-human short prompt batch (`kling-nonhuman-short-prompts.md`).

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
- `A3` records the Freepik/Kling no-audio sequence prompt after the Kling WAV/audio-reference test was blocked in this setup.
- `B1` first run: visually, Seedance 2.0 did not create a meaningful audio-reactive result. Motion looked like generic zoom/push-in with no clear response to beats or impacts. The audio may also have been altered/reinterpreted, but less noticeably than in B2.
- `B1` second run prompt used explicit media tokens: `@audio1`, `@img1`, `@img2`, `@img3`. This tests whether direct token binding improves audio reference compliance.
- `B2` separate-shot audio version is the next run, using the same explicit token style and 4s / 2s / 3s shots.
- `B2` separate-shot audio run: Seedance 2.0 appeared to try using the audio, but modified or reinterpreted the audio and synced motion to that modified version instead of the original track. Result: more obviously audio-aware than B1, but still not reliably audio-reactive and less useful than the shader-with-audio workflow.
- `B2` second-attempt prompt was documented as `variant-b2-freepik-audio-sequence-attempt2-used.md`; it used per-shot Freepik chunks with repeated global `@audio1` instructions and original continuous timeline ranges inside the chunks.
- `C1` actual full-prompt shader-video run was documented as `variant-c1-freepik-shader-video-morph-used.md`.
- `C2` actual shot-chunk shader-video run was documented as `variant-c2-freepik-shader-video-sequence-used.md`.
- `D` removes exact timecodes to test whether schedule text was overriding audio/video guidance. It uses `@vid1` as the primary driver and image anchors only as start / middle / end states.
- Early read: shader-as-video guidance appears more useful than direct audio reference. Even gentle shader motion may help because the model receives a visual timing/motion carrier plus image references as dual guidance. Next shader-video prompts refer to this guide as `@vid1` and ask the model to follow its motion and embedded audio for rhythm/transitions.
- Kling-specific shorter prompts are tracked in `kling-nonhuman-short-prompts.md`; theme is non-human subjects and motion/camera reference from `@vid1`.
