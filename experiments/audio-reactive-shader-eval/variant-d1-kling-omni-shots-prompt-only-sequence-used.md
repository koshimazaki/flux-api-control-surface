# Variant D1 - Kling Omni With Shots Prompt-Only Sequence Used

This captures the prompt-only shot sequence used for D1.

Interpretation:

- `D1` = Kling Omni with Shots output from this prompt.
- This is not the same as `D`, which uses `@vid1` as an unscheduled motion driver.
- This test uses one FLUX image anchor per shot, not a multi-image morph inside a single continuous prompt.
- There is no `@vid1` shader/video guide.
- The motion rhythm is described in text with beat/kick/snare language.
- `D2` uses a related but different Seedance prompt with more continuity/morph language.

## Prompt Used

```text
0.0-2.5s - SHOT 1 - @img1
Start with @img1 in extreme macro bird's-eye view. The cybernetic botanical specimen snaps open on the first impact, petals and radial filaments breaching forward. Keep subtle side parallax, crisp snare-like shifts, and a controlled organic recoil between beats.

Photorealistic 8K macro botanical realism, cybernetic alien flower design, cinematic lighting, HDR texture detail, stable subject continuity, organic motion blur, no shader graphics, no abstract rings, no bars, no metronome visuals.

(6s)

2.5-5.0s - SHOT 2 - @img2
Cut to @img2 on a heavy kick. The alien crown structure expands from the center with a deep bass pulse, purple-white tendrils flexing outward. Camera slowly pushes closer while the plant breathes once per second, swelling on impact and retracting between pulses.

Photorealistic 8K macro botanical realism, cybernetic alien flower design, cinematic lighting, HDR texture detail, stable subject continuity, organic motion blur, no shader graphics, no abstract rings, no bars, no metronome visuals.

(1s)

5.0-7.5s - SHOT 3 - @img3
Cut to @img3 with a sharper snare snap. The passion-flower crown opens aggressively, fine radial filaments vibrating with tactile motion. Use a short camera whip at the start, then settle into slow macro parallax and clean breathing motion.

(1s)

7.5-10.0s - SHOT 4 - @img4
Cut to @img4 as the form becomes more sacred, symmetrical, and alien. The whole crown pulses outward on each beat, tendrils lifting and settling like a living machine-organic hybrid. Keep the motion smooth, photoreal, and strongly connected to the audio impacts.

(1s)

10.0-12.5s - SHOT 5 - @img5
Cut to @img5, the rafflesia/heliconia cybernetic hybrid. Fleshy petals and engineered surfaces expand from the center on the kick, then recoil slowly. Use a slightly lower or high-side camera angle, with strong organic depth and subtle lens shake on each pulse.

(1s)

12.5-15.0s - SHOT 6 - @img6
Final shot on @img6. The huge rafflesia-like cybernetic flower fills the frame in magic-hour jungle light. Each second brings a heavy bass breath: center swelling, petals lifting, tendrils flexing. End with one final strong forward breach, then hold as the motion decays.

Photorealistic 8K macro botanical realism, cybernetic alien flower design, cinematic lighting, HDR texture detail, stable subject continuity, organic motion blur, no shader graphics, no abstract rings, no bars, no metronome visuals.

(1s)
```

## Output Files

| Variant | Local file | Model | Metadata |
|---|---|---|---|
| `D1` | `/Users/radek/Downloads/D-1-kling-magnific_create-a-video_kling_1080p_1-1_24fps_27063.mp4` | Kling Omni with Shots | H.264, 1440x1440, 24fps, 11.04s, 24M |
