# BFL FLUX Prompting Notes

Concise local digest for this repo. Source of truth remains the official BFL docs.

## Official References

- [FLUX Prompting Guide](https://docs.bfl.ai/guides/prompting_summary)
- [Prompting Basics](https://docs.bfl.ai/guides/prompting_unified_basics)
- [Building a Good Prompt](https://docs.bfl.ai/guides/prompting_unified_building)
- [Technical Parameters](https://docs.bfl.ai/guides/prompting_unified_technical)
- [Multi-Reference Editing](https://docs.bfl.ai/guides/prompting_editing_multi_reference)
- [FLUX.2 Overview](https://docs.bfl.ai/flux_2)

## Practical Prompt Shape

Use a clear subject first, then add only details that change the image:

```text
[image type], [subject], [composition/framing], [material detail],
[lighting], [palette], [background/context], [delivery constraints]
```

For FLUX.2 [pro] and [max], keep the priority order explicit:
main subject, action or state, critical style, essential context, then secondary
details. The official guide also supports JSON-structured prompts for production
workflows, which is useful for permutation batches because every prompt keeps the
same scene, subject, composition, camera, material, and delivery fields.

For this repo, source images should be good anchors for LTX target creation, so
optimize for readable form, clean silhouettes, and detailed materials:

```text
Macro photograph of a translucent flower bloom, layered petal structure,
centered composition, visible surface texture, soft studio lighting,
clean unmarked dark background, high detail
```

## What Matters For The LTX Pipeline

- Prefer `macro`, `top-down specimen`, `material study`, or `microscope-style`
  image types. These produce stable shapes that are easier for teacher V2V to
  preserve.
- Keep one dominant subject per image. The LTX training target needs a clear
  identity anchor.
- Use positive wording for omissions. Instead of `no text`, say `clean unmarked
  background`, `blank label-free surface`, or `unlabeled specimen image`.
- Use `prompt_upsampling` on FLUX.2 [pro] and [max] for quick exploration. Skip
  it on [klein], which needs detailed prompts directly.
- Use square `1024x1024` for reusable anchors unless a downstream teacher pass
  needs a video-shaped frame.
- For multi-reference FLUX.2 editing, explicitly name each input role:
  `image 1 provides the flower subject, image 2 provides the woven texture`.

## Organic Domains

### Flower

Use words that preserve identity under motion:

```text
macro photograph, single bloom, layered petal structure, surface texture, crisp
silhouette, translucent membranes, soft studio light, clean unmarked background
```

### Bacteria

Favor colony structure and membrane detail over generic abstract blobs:

```text
microscope-style image, bacteria colony, branching cellular clusters,
translucent membranes, spores, radial growth rings, laboratory lighting,
unlabeled specimen image
```

### Fabric

Make texture/fold direction explicit:

```text
macro material study, woven fabric, visible threads, interlocking fibers,
deep folds, ripple direction, tactile surface texture, clean studio background
```

## Model Choice

- `flux-2-pro-preview`: good default for high-quality source images.
- `flux-2-pro`: pinned snapshot when reproducibility matters.
- `flux-2-max`: highest quality when cost/latency is acceptable.
- `flux-2-klein-9b-preview`: faster iteration and dataset volume.
- `flux-2-klein-4b`: fastest rough exploration.
- `flux-2-klein-*-finetuned`: use uploaded Klein LoRAs via `finetune_id`.
  This is for custom style/subject inference after training `.safetensors`
  locally or on RunPod.

## Quality Checklist

Keep an image only if:

- The subject is obvious at thumbnail size.
- Shape language survives crop to video aspect ratio.
- Texture is specific enough to become motion material.
- Background is clean enough not to become the learned subject.
- It can plausibly become a first frame for a flower/bacteria/fabric target.
