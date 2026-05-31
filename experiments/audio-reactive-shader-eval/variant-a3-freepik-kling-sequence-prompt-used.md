# Variant A3 - Freepik / Kling Sequence Prompt Used

This captures the no-audio sequence prompt used after the Kling branch could not run the WAV/audio-reference test. It is a record of the platform prompt chunks, not a cleaned ideal prompt.

## Platform Constraint

Kling branch could not run the direct WAV audio-reference test in this setup. Treat this as a blocked audio-input branch, not as an audio-reactivity result.

## Shot 1 - 4s

```text
@img1: light passion flower - passion-flower-01-1_84e9f3cd-4187-43ba-a2c0-fc2576746b3d
Visual source: extreme top-down macro photograph of a single cybernetic botanical specimen inspired by victoria amazonica and heliconia lobster claw; engineered radial filaments, alien crown structure, purple-white tendrils, sacred tropical plant geometry.

3.80-5.90s:
Morph from @img1 into @img2.
The central mass swells outward, surface plates shift, and the camera continues a slow macro push.
By 5.90s, @img2 should be the clear dominant subject.

Photorealistic macro, cinematic lighting, high-detail organic and cybernetic textures, stable subject identity, smooth morphing, controlled camera movement, natural motion blur, high dynamic range, no duplicated flowers, no collage, no text, no UI, no abstract shader graphics.
```

## Shot 2 - 2s

```text
@img2: dark passion flower - passion-flower-01-1_e932a2fa-f6a3-4f22-8333-8fdf77c0c733
Visual source: extreme top-down macro photograph of a single cybernetic botanical specimen inspired by lithops living stones, black pitcher plant / nepenthes, victoria amazonica, and heliconia lobster claw; engineered radial filaments, alien organic machinery.

5.90-8.22s:
Morph from @img2 into @img3.
Petals and tendrils reorganize into the final hybrid flower shape.
End on @img3 as a sharp, stable, coherent single botanical organism.
```

## Shot 3 - 3s

```text
@img3: flowing combo hybrid - combo-passion-flower-x-rafflesia-x-heliconia-lobster-claw-plant-2_9d7aeda0-6f67-426b-bc64-44b9f3d1aade
Visual source: cinematic macro photograph of one coherent cybernetic botanical hybrid specimen fusing passion flower, rafflesia, and heliconia lobster claw into a single organism; not a collage and not multiple separate flowers.

8.22-9.00s:
Hold on @img3 for overflow and trimming safety.
Let the final hybrid organism settle with tiny mechanical breathing motion and a stable top-down macro camera.

Photorealistic macro, cinematic lighting, high-detail organic and cybernetic textures, stable subject identity, smooth morphing, controlled camera movement, natural motion blur, high dynamic range, no duplicated flowers, no collage, no text, no UI, no abstract shader graphics.
```

## Interpretation Notes

- This is useful as a sequence/shot-control prompt record, not an audio-reactive test.
- The shot chunks preserve the same `4s / 2s / 3s` integer structure used in Freepik.
- The text inside chunks still references the original continuous timeline, so evaluate whether the model follows platform shot duration or the embedded timestamp text.

