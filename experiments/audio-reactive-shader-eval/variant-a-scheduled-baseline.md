# Variant A - Scheduled Text Baseline

Use this first as the control pass. Do not upload a shader guide video. If the platform requires the audio file for the final render, attach `AI3-remix2.wav`, but do not ask the model to analyze or follow the audio. The prompt should test whether timestamp scheduling alone is enough.

```text
[SETUP]
Create one continuous 9.00 second cinematic macro video from the three reference images.
Use the reference images as visual anchors in the exact order listed below.
Follow the timestamp schedule as closely as possible.
Do not use an abstract shader guide, waveform guide, beat guide, metronome, or audio-analysis instructions.

Target video model: Seedance 2.0
Audio source for final soundtrack, if needed: AI3-remix2.wav
Video duration: 9.00 seconds, with the main schedule ending at 8.22s and a final overflow hold from 8.22-9.00s.
Shot plan: three scheduled image states with two visible morph transitions.

[IMAGE REFERENCES / LEGEND]
@img1: light passion flower - passion-flower-01-1_84e9f3cd-4187-43ba-a2c0-fc2576746b3d
Visual source: extreme top-down macro photograph of a single cybernetic botanical specimen inspired by victoria amazonica and heliconia lobster claw; engineered radial filaments, alien crown structure, purple-white tendrils, sacred tropical plant geometry.

@img2: dark passion flower - passion-flower-01-1_e932a2fa-f6a3-4f22-8333-8fdf77c0c733
Visual source: extreme top-down macro photograph of a single cybernetic botanical specimen inspired by lithops living stones, black pitcher plant / nepenthes, victoria amazonica, and heliconia lobster claw; engineered radial filaments, alien organic machinery.

@img3: flowing combo hybrid - combo-passion-flower-x-rafflesia-x-heliconia-lobster-claw-plant-2_9d7aeda0-6f67-426b-bc64-44b9f3d1aade
Visual source: cinematic macro photograph of one coherent cybernetic botanical hybrid specimen fusing passion flower, rafflesia, and heliconia lobster claw into a single organism; not a collage and not multiple separate flowers.

[TIMELINE / SCHEDULED ONLY]
0.00-3.80s:
Use @img1 as the main subject.
The specimen slowly opens from the center, tendrils flex outward, and the camera makes a subtle top-down push-in.
Keep the subject stable and recognizable.

3.80-5.90s:
Morph from @img1 into @img2.
The central mass swells outward, surface plates shift, and the camera continues a slow macro push.
By 5.90s, @img2 should be the clear dominant subject.

5.90-8.22s:
Morph from @img2 into @img3.
Petals and tendrils reorganize into the final hybrid flower shape.
End on @img3 as a sharp, stable, coherent single botanical organism.

8.22-9.00s:
Hold on @img3 for overflow and trimming safety.
Let the final hybrid organism settle with tiny mechanical breathing motion and a stable top-down macro camera.

[QUALITY]
Photorealistic macro, cinematic lighting, high-detail organic and cybernetic textures, stable subject identity, smooth morphing, controlled camera movement, natural motion blur, high dynamic range, no duplicated flowers, no collage, no text, no UI, no abstract shader graphics.
```
