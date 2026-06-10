# Variant D2 - Seedance 2.0 Fast Prompt-Only Shot Sequence Used

This captures the prompt-only shot sequence used for D2.

Interpretation:

- `D2` = Seedance 2.0 Fast output from this prompt.
- This is not the same as `D`, which uses `@vid1` as an unscheduled motion driver.
- This test uses one FLUX image anchor per shot / transition state, but relies on prompt-only continuity and morph language.
- There is no `@vid1` shader/video guide.
- Compared with D1, this prompt is less hard-cut and more continuity-based: flowers close, compress, open, and morph toward the next image/environment.

## Prompt Used

```text
Open on @img1 from top EVM view: a cybernetic botanical specimen over dark lithops stones, black pitcher-plant forms, and humid jungle texture. The flower snaps open on the first impact, radial filaments and tendrils breathing outward once per second. Camera slowly zooms into the center. Near the end, the petals fold inward and close like an organic mechanical iris, preparing the morph into @img2.

Photorealistic 8K macro botanical realism, cybernetic alien flower design, cinematic lighting, HDR texture detail, stable subject continuity, organic motion blur, no shader graphics, no abstract rings, no bars, no metronome visuals.

(2s)

2.5-5.0s - opens from the closed center of the previous flower into a new environment: a sacred tropical water-garden with victoria amazonica leaves, wet reflections, and purple-white alien tendrils. Start top-down, then zoom deeper into the crown. On each bass pulse, the center swells and the tendrils expand. At the end, the crown closes inward and compresses into a glowing botanical core, morphing toward @img3.

Photorealistic 8K macro botanical realism, cybernetic alien flower design, cinematic lighting, HDR texture detail, stable subject continuity, organic motion blur, no shader graphics, no abstract rings, no bars, no metronome visuals.

(2s)

@img3 blooms open from that compressed core into a new humid jungle macro environment, now focused on a passion-flower cybernetic crown. Begin from overhead EVM view, then push into the fine radial filaments. The snare hits make the crown snap open sharply, then recoil with tactile parallax. By the end, the filaments curl inward, the flower closes, and the center reshapes into @img4.

(2s)

opens into a more symmetrical sacred alien environment, like a tropical temple-garden seen from top macro view. The flower unfolds wider than before, tendrils lifting from the surface as the camera zooms into the center. Each beat makes the crown pulse outward, then settle. Near the end, the whole structure folds shut in a clean iris motion and morphs into the next hybrid form.

(3s)

opens into a new specimen-like environment: clean plane, botanical lab surface, wet tropical shadows, rafflesia and heliconia hybrid details. Start from top EVM view, then zoom inward as fleshy petals and engineered surfaces expand on each kick. The plant breathes heavily with subtle lens shake. At the end, the petals close over the camera, forming a dark organic tunnel that transitions into @img6.

(2s)

opens from the dark tunnel into a final magic-hour jungle environment, a huge rafflesia-like cybernetic flower filling the frame. Begin overhead, then zoom deep into the living center. Each second brings a heavy bass breath: petals lift, fleshy folds expand, tendrils flex, then recoil. On the final hit, the flower opens fully one last time and holds in an intense close-up as motion slowly decays.

Photorealistic 8K macro botanical realism, cybernetic alien flower design, cinematic lighting, HDR texture detail, stable subject continuity, organic motion blur, no shader graphics, no abstract rings, no bars, no metronome visuals.

(3s)
```

## Output File

| Variant | Local file | Model | Metadata |
|---|---|---|---|
| `D2` | `/Users/radek/Downloads/D-2-magnific_create-a-video_seedance_720p_1-1_24fps_27064.mp4` | Seedance 2.0 Fast 720p | H.264 + AAC, 960x960, 24fps, 14.07s, 7.9M |
