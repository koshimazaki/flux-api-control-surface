# Kling Non-Human Short Prompts

Kling-specific compact prompts for non-human, audio/video-guided motion tests. Keep these shorter than the Seedance/Freepik prompts because Kling tends to respond better to clear subject + motion + camera + style language.

## K0 - Same Setup Ultra-Compact

Use this first when character count is tight.

```text
9s cinematic top-down macro video, one non-human cybernetic flower. Use @vid1 only for motion rhythm, embedded audio feel, and camera/action reference, not visual style. Visual anchors in order: @img1 start, @img2 middle morph, @img3 final.

Dark wet jungle/lithops altar, Fuji film look, shallow DOF. Flower snaps open on impacts, breathes once per beat, radial filaments pulse, tendrils expand/recoil, blossom rotates with sharp servo-like mechatronic motion. Slow locked top-down zoom into the center.

Start as @img1. Midway compress into a glowing core and morph through @img2. Near the end open into @img3, then fold inward like a mechanical iris while staying one stable organism.

Photorealistic 8K macro VFX, wet highlights, natural motion blur, stable subject continuity. No humans, text, UI, abstract rings/bars/metronome, flat shader look, collage, duplicate flowers.
```

## K1 - Single 9s Video-Reference Prompt

Use when Kling accepts `@vid1` as a video reference.

```text
Cinematic top-down macro nature video. Non-human cybernetic botanical specimen, dark jungle altar, glossy black lithops stones, black pitcher-plant forms, humid mist.

Use @img1 as the starting flower. Use @vid1 for motion rhythm and camera/action reference. The flower breathes in and out, snaps open on impacts, radial filaments pulse once per beat, tendrils expand/recoil, and the blossom rotates with precise mechatronic servo motion. Slow top-down zoom into the center, shallow depth of field, Fuji film look.

Midway, morph toward translucent glowing fractal energy from @img2. Near the end, morph into the alien mechanical botanical species from @img3, then fold inward like an organic mechanical iris.

Photorealistic 8K macro botanical realism, high-budget VFX, wet specular highlights, natural motion blur, stable subject continuity. No humans, no text, no UI, no abstract rings, no bars, no metronome graphics, no flat shader look.
```

## K2 - Three-Shot Compact Prompt

Use when Kling wants clear shots or storyboard language.

```text
High-budget macro VFX music video, non-human cybernetic flower, top-down view, Fuji film look, shallow depth of field, humid jungle altar with black lithops stones and pitcher-plant forms.

Shot 1: @img1 starts as a closed mechanical flower. It snaps open, breathes once per beat, radial filaments pulse outward, tendrils recoil, and the blossom slowly rotates like a servo-driven iris. Camera locked top-down, slow zoom in.

Shot 2: The flower folds inward and compresses into a glowing core, morphing into translucent fractal energy from @img2. Core contracts on each beat, wet stones reflect the glow.

Shot 3: The core opens into @img3, an alien mechanical botanical species. Tendrils branch outward with precise robotic articulation, then fold inward again near the end.

Use @vid1 for motion rhythm and camera/action reference. Photorealistic macro realism, cinematic HDR lighting, natural motion blur, stable subject continuity. No humans, no text, no UI, no abstract shader graphics.
```

## K2B - Three-Shot Morph Continuity

Use when the three-shot version separates images too much.

```text
One continuous 9s top-down macro video, not three separate clips. Use @vid1 only for motion rhythm, embedded audio feel, and camera/action reference, not visual style. Exaggerate @vid1 motion with bold servo-like mechatronic opening, breathing, pulsing, recoil, rotation, and iris-folding. Visual anchor order: @img1 -> @img2 -> @img3.

Shot 1:
Start as @img1 on a dark wet jungle/lithops altar. The flower snaps open on impacts, breathes once per beat, radial filaments pulse, tendrils expand/recoil, and the blossom slowly rotates. During the last third, begin morphing into @img2: purple-white tendrils darken, surface plates swell, black pitcher-plant textures grow through the petals. End mid-morph, no cut.

Shot 2:
Continue from the exact end state of Shot 1. Complete the morph into @img2, then compress the flower into a glowing mechanical core. The core contracts on each beat while the camera keeps a slow locked top-down zoom. During the last third, start morphing toward @img3: longer flowing tendrils, rafflesia/heliconia forms emerging from the dark core. End mid-morph, no cut.

Shot 3:
Continue from the exact end state of Shot 2. Open fully into @img3 as one coherent alien mechanical botanical organism. Tendrils branch outward with robotic articulation, then fold inward near the end like a mechanical iris while still breathing subtly to @vid1.

Photorealistic 8K macro VFX, Fuji film look, shallow DOF, wet highlights, cinematic HDR, natural motion blur, stable single subject continuity. No humans, text, UI, collage, duplicated flowers, abstract rings/bars/metronome, flat shader look.
```

## K3 - Per-Shot Prompt Template

Use for separate Kling shots if character limits are tight.

```text
Non-human cybernetic botanical macro shot. Use @imgX as the subject and @vid1 as motion/camera reference. Top-down Fuji film macro, shallow depth of field, wet jungle altar.

Action: flower breathes once per beat, opens/closes like a mechanical iris, radial filaments pulse outward, tendrils recoil, slow servo-like rotation, slow zoom into center.

Photorealistic 8K botanical VFX, stable subject, natural motion blur. No humans, no text, no UI, no abstract rings/bars/metronome.
```

## Kling Prompt Notes

- Prefer one main non-human subject per shot.
- Put movement words early: breathes, snaps open, pulses, recoils, rotates, folds inward.
- Use `@vid1` as motion/camera/action reference, not as visual style.
- Keep sensory detail secondary; long atmosphere prose can crowd out motion instructions.
- For feedback to Kling, test non-human subjects: botanical mechanisms, materials, objects, fluids, mechanical morphs.
