# 2026-06-16 - Untwisting RoPE Style Transfer Spike

Status: watchlist / first-pass integration plan

Source repo: https://github.com/BigStationW/ComfyUi-Untwisting-RoPE

## Why Track This

`ComfyUi-Untwisting-RoPE` is a ComfyUI implementation of training-free style
transfer for DiT models. The repo lists support for Z-Image/Z-Image Turbo,
Anima, FLUX.2, and Qwen Image/Edit. That makes it relevant to the image-anchor
side of this Demos repo because it may provide a style-transfer pass before
motion/video generation without waiting on a custom LoRA.

The useful question is not "should this replace Klein style LoRA?" but whether
it can become a cheap inference-stage style transfer step:

```text
BFL/FLUX anchor image + style/reference image
  -> Untwisting RoPE style pass on RunPod
  -> styled anchor frame / storyboard state
  -> FLUX motion, Seedance, Kling, or LTX video stage
```

## First Integration Shape

Start with RunPod ComfyUI, not a from-scratch Python port:

- install the custom node in `/workspace/ComfyUI/custom_nodes`;
- install its helper nodes:
  - `BigStationW/ComfyUi-Scale-Image-to-Total-Pixels-Advanced`
  - `BigStationW/ComfyUi-TextEncodeEditAdvanced`
- use the upstream FLUX.2 Klein or Z-Image Turbo workflow as the first smoke
  test;
- export an API-format workflow and run it through the existing
  `LTX/pipeline/comfy_runner.py` pattern;
- save outputs as styled anchors that can be fed into the existing image/video
  evaluation tracks.

This keeps Comfy as GPU/session orchestration while the Demos repo keeps the
repeatable manifest, input/output naming, and evaluation notes.

## Python Extraction Read

A direct Python path looks possible but non-trivial. The current implementation
is tightly coupled to Comfy internals:

- it clones a Comfy `MODEL` object and wraps `apply_model`;
- it patches FLUX.2 double-stream and single-stream attention blocks in-place;
- it builds an RF inversion trajectory from the sampler sigma schedule;
- it caches reference trajectories and appends reference K/V tokens during
  attention;
- it depends on Comfy FLUX helpers such as `apply_rope`,
  `optimized_attention_masked`, model metadata, and latent packing behavior.

So the practical order is:

1. prove quality with RunPod Comfy on one known image/style pair;
2. add a reusable API workflow manifest if it works;
3. only then consider extracting a Python module for the custom pipeline.

The extraction would probably live as a RunPod inference worker first, not as UI
code. That matches the creator-workbench direction: UI and agent routes submit a
manifest, remote GPU work returns output files plus provenance.

## Evaluation

Use this as a LoRA-alternative comparison, not as a claim that training is
unneeded.

Compare:

- baseline FLUX.2 anchor;
- Untwisting RoPE styled anchor from the same prompt/image;
- Klein LoRA styled anchor when available;
- downstream video result using the same motion/audio guide.

Score:

- style transfer strength without copying the reference composition too hard;
- subject identity preservation;
- texture/detail quality after video interpolation;
- runtime, VRAM pressure, and operational friction on RunPod.

Open questions:

- Does it preserve the exact botanical/object identity well enough for
  storyboard continuity?
- Is RF inversion overhead acceptable for batch anchor generation?
- Are FLUX.2 Klein workflows good enough, or is Z-Image Turbo the faster
  proving ground?
- Can the resulting styled anchor reduce the need for early Klein LoRA training,
  or is it mainly a preview/prototyping stage?
