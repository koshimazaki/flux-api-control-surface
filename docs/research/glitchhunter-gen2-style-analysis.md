# GlitchHunter FLUX.1 gen2 visual analysis

Analyzed: 2026-08-01  
Source: `/Users/radek/Documents/GIthub/Demos/Datasets/Flux.1/GlitchHunter/flux_gen2/gen2`  
Coverage: all 130 PNGs, inspected visually in numbered contact sheets  
Machine-readable catalog: `configs/glitchhunter_gen2_style_catalog.json`

## Independent conclusion

This is not one style dataset. It is one coherent **visual universe organized along two independent axes**:

1. **Visual language:** Pastel Xenotoy, Neon Mecha Reliquary, Acid Vector Totem, or Noctilucent Relic Forest.
2. **Rendering depth:** studio/cinematic 3D, FLUX.1 velvet 2.5D, or graphic 2D.

The recurring DNA is stable—cyber-organic anatomy, circular lens/portal motifs, flora fused with machinery, and a cyan/magenta/pink/acid-green palette—but the same DNA can be rendered at different representational depths. This is more useful than treating each cluster as a mutually exclusive “style.”

If all 130 images are mixed into one training bucket, a model will probably learn the broad idea of a “colorful cyber-organic creature” while averaging away the most valuable distinctions. The better approach is four clean banks plus deliberate pairwise hybrids.

| Code | Family | Files | Core signal | Best use |
|---|---|---:|---|---|
| PX | Pastel Xenotoy | 34 | Soft resin/vinyl, rounded shells, floral fins, oversized lenses, clean studio light | Style reference, character identity, product/figure renders |
| NM | Neon Mecha Reliquary | 20 | Black shell armor, spikes, cables, circular energy nodes, magenta/cyan emission | Hard-surface style, mecha/game characters, cyberpunk video |
| AV | Acid Vector Totem | 42 | Ink contour, flat print color, cream grounds, splashes, stacked poster-like silhouettes | Editorial art, posters, graphic animation, high-identity LoRA candidate |
| NR | Noctilucent Relic Forest | 34 | Dark ecology, ruins, monoliths, glowing orbs, mist and cinematic depth | Worldbuilding, environments, narrative video and lighting |

There are 129 unique images. `66.png` and `116.png` are exact duplicates.

## Second axis: 3D → velvet 2.5D → 2D

| Depth | Files | Subtypes | Defining quality |
|---|---:|---|---|
| 3D | 57 | Studio shot; cinematic/world render | Physically modeled forms, material response, spatial light and unambiguous volume |
| Velvet 2.5D | 25 | Character/totem; world/structure | Soft matte coating, airbrushed relief, ink-defined shapes and shallow illustrative depth |
| 2D | 48 | Abstract totem; scenic graphic | Flat silhouette, line, negative space and layered color fields dominate over physical volume |

The important correction is that **2.5D is not a weak midpoint or failed 3D render**. It is a distinct and especially valuable FLUX.1 aesthetic: softly modeled forms with a velvety coating, precise illustration contours, controlled highlights, and depth that still feels drawn.

The clearest character anchors are `8, 10, 11, 86`. Images `11` and `86` belong together on this axis even though their subject/style-family assignments differ. Images `114` and `119` apply related 2.5D treatment at world scale, with a softer, more environmental vibe.

The 2D lane also divides naturally:

- **Abstract 2D:** `71` is the clearest reference—isolated, flattened, stacked and poster-like.
- **Scenic 2D:** `100, 101, 103` form a separate, strong illustrated-world style with layered foliage, flat atmospheric depth, hard-edged light shapes and animation-background staging.

This creates two useful representation ladders:

- **Character:** `71` (abstract 2D) → `8/10/11/86` (velvet 2.5D) → `37/81/89` (studio 3D).
- **World:** `100/101/103` (scenic 2D) → `114/119` (velvet 2.5D world) → `61` (cinematic 3D).

Those ladders are unusually good FLUX 3 animation tests because the semantic world can remain stable while only representational depth changes.

## The four style cards

### PX — Pastel Xenotoy

The softest and most product-like lane. These images read as collectible bio-creatures photographed or rendered against clean backgrounds. The key is not merely “cute”: it is the combination of polished shell surfaces, embedded lenses/ports, petal-like protrusions, and restrained studio depth.

Strong anchors: `24, 26, 33, 37, 41, 43, 45, 52, 53, 67, 70, 78, 84, 89, 91, 107, 120, 123, 126, 130`.

Risk: if mixed too broadly, this collapses into generic colorful vinyl-toy imagery. Preserve the biological asymmetry, exposed inner anatomy, and optical-port motif.

### NM — Neon Mecha Reliquary

The hardest and most engineered lane. It shares the circular optics and saturated highlights with PX, but replaces soft shells with dark armor, spikes, cable bundles, articulated plates, and ritual-machine symmetry. This is the best lane for a new RT/game/mecha aesthetic.

Strong anchors: `21, 35, 39, 40, 62, 64, 66, 80, 81, 82, 83, 109, 118, 127`.

Risk: `66` and `116` must not both enter a training set. The lane is also small after deduplication, so favor curation over trying to fill it with weaker hybrids.

### AV — Acid Vector Totem

The most visually ownable lane. These images have a print/editorial grammar rather than merely a palette: hard contours, controlled flat fills, negative space, ink splashes, and vertically stacked asymmetrical creatures. It can survive subject changes better than the glossy lanes because its identity lives in mark-making and composition.

Strong anchors: `4, 6, 7, 9, 13, 14, 15, 17, 23, 46, 57, 58, 71, 85, 93, 94, 95, 96, 105, 106, 111, 113, 115, 117, 122, 128`.

Risk: separate clean flat-print examples from cinematic scenic illustrations when making a strict training subset.

### NR — Noctilucent Relic Forest

This lane supplies the world rather than just the character. It contains ruins, giant organic machines, monoliths, levitating shrines, mist, pools, deep vegetation, and glowing spheres. It is the strongest source for video atmosphere, environmental storytelling, and lighting behavior.

Strong anchors: `5, 12, 18, 19, 20, 29, 30, 34, 51, 59, 60, 61, 73, 75, 76, 77, 88, 90, 92, 97, 98, 99, 100, 101, 103, 104, 114, 119, 121, 124, 125, 129`.

Risk: it is compositionally diverse. For a character-only model, many of these are better held out as environment/control references than used as style-training rows.

## Four promising new hybrid styles

| Hybrid | Image 1: style/identity | Image 2: structure | Intended result |
|---|---:|---:|---|
| Candy Armour Bloom | `89` (PX) | `81` (NM) | Soft coral/mint floral resin rebuilt into an angular armored humanoid |
| Noctilucent Screenprint | `95` (AV) | `100` (NR) | A forest-relic composition rendered as hard-outlined psychedelic print art |
| Forest Toy Relic | `92` (NR) | `110` (PX) | A clean studio creature reconstructed from mist, roots, spores and dark relic material |
| Mecha Mythogram | `109` (NM) | `122` (AV) | Black-chrome machinery occupying a vertical graphic-totem composition |

These pairings intentionally cross **rendering grammar** and **shape/staging**, rather than merely blending two similar palettes.

## FLUX 3 style-plus-structure prompt template

```text
Use image 1 as the exact first frame and the exclusive source of visual identity, colors, lighting, textures, materials and atmosphere.

Use image 2 only as the destination structure: its composition, spatial arrangement, silhouette, depth, pose and camera framing. Reconstruct that structure entirely from the visual language and materials of image 1.

Animate the world of image 1 continuously reorganizing itself into the structure of image 2. Components unfold, migrate, rotate and physically reassemble. Keep the transition engineered rather than dissolved; do not crossfade between the references.

By the final frame, match image 2's composition and spatial geometry while remaining unmistakably the world and aesthetic of image 1. It should look like image 1 rebuilt inside image 2's structure.
```

For each hybrid, replace “components” with family-specific motion language:

- PX: petals inflate, silicone shells flex, tendrils curl, resin plates unfold.
- NM: armored plates unlock, cables tension, energy nodes migrate, joints articulate.
- AV: ink contours redraw, flat color fields slide, splashes branch, totem layers stack.
- NR: roots grow, mist condenses, relic fragments levitate, spores and light pools migrate.

## Recommended preparation

1. Keep the original 130-file bank untouched.
2. Build four curated reference collections from the primary assignments in the JSON catalog.
3. Remove `116.png` as a duplicate of `66.png` from any training subset.
4. For style/control video tests, use one image from a style bank and a compositionally clear image from a different structure bank.
5. Run the four starter pairs first with the same duration, seed, aspect ratio, and prompt skeleton.
6. Score style retention, final structural match, transition continuity, and aesthetic leakage separately.
7. Promote successful results as new hybrid exemplars; do not immediately fold all outputs back into the source family.

## Cross-cutting control banks

- Strong structure guidance: `12, 17, 24, 32, 34, 50, 59, 63, 68, 71, 72, 73, 74, 77, 90, 95, 97, 100, 111, 113, 115, 119, 122, 129`.
- Architecture/world control: `12, 32, 34, 50, 59, 68, 72, 73, 74, 77, 90, 97, 98, 99, 100, 119`.
- High-value transition bridges: `1, 5, 16, 21, 30, 36, 47, 49, 55, 61, 65, 77, 84, 86, 88, 90, 102, 108, 112, 114, 119, 125, 129`.

The architecture/isometric images are especially valuable as ControlNet-like destination structures, even when they should not define a character style.
