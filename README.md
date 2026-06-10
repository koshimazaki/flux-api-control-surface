# BFL — FLUX asset generation + Klein style LoRA

Black Forest Labs work: FLUX asset generation via their API/MCP server,
self-hosted Klein style LoRA training via AI-Toolkit, and managed BFL inference
for uploaded Klein LoRAs. In this repo BFL mainly powers the source image pool
for downstream LTX IC-LoRA training: flowers, bacteria, fabric, and abstract
organic material references.

## Two tracks

### Track 1 — Asset generation via FLUX API or MCP

BFL ships:
- API endpoints under `https://api.bfl.ai/v1/...` using `BFL_API_KEY`
- an MCP server at `https://mcp.bfl.ai` using OAuth inside compatible clients

**MCP setup (Codex / Claude-compatible clients):**
```bash
codex mcp add FLUX --url https://mcp.bfl.ai
```

**API generation helper in this repo:**
```bash
# Writes the planned requests without spending credits
python BFL/pipeline/generate_assets.py --dry-run

# Real generation; downloads signed URLs immediately
export BFL_API_KEY=...
python BFL/pipeline/generate_assets.py \
  --prompts BFL/configs/organic_anchor_prompts.json \
  --model pro-preview \
  --out outputs/bfl/organic_anchors

# Or keep the key in a local gitignored file copied from BFL/.env.example
python BFL/pipeline/generate_assets.py \
  --env-file BFL/.env \
  --prompts BFL/configs/organic_anchor_prompts.json \
  --model pro-preview \
  --out outputs/bfl/organic_anchors
```

**Cybernetic flower Pro/Max test pass:**
```bash
# Build structured FLUX.2 prompts from the editable axes
python BFL/pipeline/build_plant_prompt_matrix.py \
  --axes BFL/configs/cybernetic_flower_axes.json \
  --out BFL/configs/cybernetic_flower_flux2_prompts.json \
  --variants-per-species 2 \
  --prompt-format json \
  --domain cybernetic_flowers

# Cheap/fast quality pass on latest FLUX.2 [pro]
python BFL/pipeline/generate_assets.py \
  --prompts BFL/configs/cybernetic_flower_flux2_prompts.json \
  --model pro-preview \
  --prompt-upsampling \
  --out outputs/bfl/cybernetic_flowers/pro_preview

# Small final-quality comparison pass on FLUX.2 [max]
python BFL/pipeline/generate_assets.py \
  --prompts BFL/configs/cybernetic_flower_flux2_prompts.json \
  --model max \
  --prompt-upsampling \
  --limit 4 \
  --out outputs/bfl/cybernetic_flowers/max_test
```

**Local prompt workbench:**
```bash
cd BFL/ui
npm install
npm run dev -- --port 3017
```

Open `http://localhost:3017` to edit the structured prompts, paste a BFL API
key, add up to three reference images, generate, and review outputs in an
AImedia-compatible local library (`nb2_generations`).

Optional durable archive: configure the Worker in `cloudflare/` and set
`BFL_ASSET_WORKER_URL` plus `BFL_ASSET_WORKER_TOKEN` in `ui/.env.local`. The
dashboard will keep local files and also upload generated PNGs, prompts, and
metadata to R2 with searchable D1 rows.

The dashboard is still local-first. It can be opened later as a public dev-tool
demo after more examples, testing, and a final secrets/output scrub. See
[`ui/README.md`](./ui/README.md#public-release-gate).

Use an uploaded BFL Finetune / Klein LoRA from the API:

```bash
python BFL/pipeline/generate_assets.py \
  --prompts BFL/configs/organic_anchor_prompts.json \
  --finetune-id my-organic-style \
  --finetune-strength 0.85 \
  --model klein-9b-finetuned \
  --out outputs/bfl/organic_anchors_lora
```

If `--finetune-id` is supplied without `--endpoint`, the helper defaults to
`flux-2-klein-9b-kv-finetuned`.

Prompting notes for this project live in
[`references/prompting_guide.md`](./references/prompting_guide.md).

**Useful FLUX.2 endpoints** (per BFL docs):
- `flux-2-pro-preview` — latest FLUX.2 [pro], good default for source images
- `flux-2-pro` — pinned/reproducible FLUX.2 [pro]
- `flux-2-max` — highest quality
- `flux-2-flex` — flexible editing/generation, typography-friendly
- `flux-2-klein-9b-preview` / `flux-2-klein-9b` — faster 9B model
- `flux-2-klein-4b` — fastest/lightest model

**Use cases for this monorepo:**
- Generate **source images** for LTX target creation: flower, bacteria, fabric, abstract material
- Generate **image pools** for mismatched-anchor stress tests
- Create texture/style boards for teacher V2V passes
- Generate dataset augmentation for StableAudio album-art accompaniments
- Demo / folio content as side outputs

### Track 2 — Klein style LoRA training (self-hosted, AI-Toolkit)

Per [BFL docs](https://docs.bfl.ai/flux_2/flux2_klein_training_example), Klein style training is local-CUDA via [AI-Toolkit](https://github.com/ostris/ai-toolkit). YAML-configured.

**Dataset format:**
- 20-40 images optimal (27 used in BFL example)
- Paired `image.png` + `image.txt` (caption) in single folder
- Captions: objective visual description + unique trigger word, **omit style descriptors**
- 1024px+ recommended

**Training config notes (from BFL example):**
- Steps: ~3000
- Learning rate: `0.000095` (low, lets style emerge)
- Network dims tuned for texture capture
- Inference: 8 steps to preserve painterly aesthetic
- Save: every 150 steps, keep last 20 checkpoints

**Output:** local LoRA weights (`.safetensors`). Current BFL docs also support
uploading those weights to Dashboard → Customization → Finetunes and calling
managed `-finetuned` Klein endpoints with `finetune_id`.

**BFL hosted LoRA limits:**
- Public beta as of this repo update
- FLUX.2 [klein] endpoints only, not arbitrary Pro/Max LoRA stacking
- One LoRA per request
- The uploaded LoRA base model must match the endpoint
- `finetune_strength` controls LoRA contribution; start at `1.0`, sweep down if it overpowers prompts

**Compute:** any CUDA box. RunPod A100 / H100 viable; existing `/Users/radek/Documents/GIthub/LoRAdo/runpodctl` can launch.

## Planned artefacts in this folder

1. **`pipeline/generate_assets.py`** — API helper to bulk-generate themed source images for LTX
2. **`klein-style-lora/`** — first FLUX.2 Klein style LoRA on a curated personal aesthetic (Glitch Candies, SIDKIT panel renders, or sonification visuals)
3. **`flux2-multi-reference/`** — exploration of FLUX.2 multi-reference editing for subject/style consistency

## Next actions

- [x] Add organic source image prompt plan (`configs/organic_anchor_prompts.json`)
- [x] Add BFL API helper (`pipeline/generate_assets.py`)
- [ ] Register BFL MCP with Codex or another compatible client if conversational image generation is preferred
- [ ] Verify OAuth + credit balance via `get_credits`
- [ ] Generate first batch of flower/bacteria/fabric source images
- [ ] Clone AI-Toolkit, set up Klein training environment on RunPod
- [ ] Pick first Klein style target (Glitch Candies aesthetic, SIDKIT panel aesthetic, or sonification scientific aesthetic) — start with 27-image set per BFL example
- [ ] Train first Klein style LoRA, evaluate, publish

## Sources

- [BFL Quick Start](https://docs.bfl.ai/quick_start/introduction)
- [BFL Image Generation API](https://docs.bfl.ai/quick_start/generating_images)
- [BFL MCP Integration](https://docs.bfl.ai/api_integration/mcp_integration)
- [BFL Prompting Guide](https://docs.bfl.ai/guides/prompting_summary)
- [FLUX.2 Overview](https://docs.bfl.ai/flux_2)
- [Klein Training Example](https://docs.bfl.ai/flux_2/flux2_klein_training_example)
- [FLUX.2 LoRA Inference](https://docs.bfl.ai/flux_2/flux2_lora_inference)
- [AI-Toolkit (ostris)](https://github.com/ostris/ai-toolkit)
