# Asset Workbench Readiness

Date: 2026-06-19
Status: public-safe readiness note

This note assesses how ready the FLUX API Control Surface is to become a broader
asset workbench without losing the current BFL focus.

The recommended near-term scope is still simple: prompts and images. The app can
reserve clean extension points for audio, video, CAD, 3D, shaders, scenes, and
other providers, but the first public version should make the BFL image and
prompt loop feel solid before expanding the visible product.

## Direction

Use BFL as the first provider lane, not as the whole architecture.

The public tool should remain:

- a FLUX/BFL prompt and image control surface;
- a local asset library for generated images, imported references, glyphs, and
  reusable prompts;
- an agent-friendly bridge between the official FLUX MCP and local UI-visible
  outputs;
- a foundation for provider/model/job manifests that can later support more
  engines.

Later lanes such as text-to-CAD, faceplate makers, character face makers,
Three.js object builders, and audio-reactive world tools should plug into the
same asset/job layer as providers. They do not need to be first-release tabs.

## Current Readiness

| Area | Current state | Readiness | Main gap |
|---|---|---:|---|
| Image assets | Generated outputs, imported images, references, tool outputs, glyph previews, local JSON/prompt files, PNG metadata, and optional remote archive records. | Ready | Asset schema is still image-shaped. |
| Prompt library | Editable prompt records, prompt domains, gallery prompt capture, and audio-sequence "Save to library". | Usable | Prompts are not yet first-class assets in the shared gallery. |
| References | Gallery cards can be reused as image references with roles such as character, style, environment, pose, and loose. | Ready for images | Needs stable handle badges like `@img1` and `@prompt1`. |
| Metadata | Outputs preserve prompt/settings metadata in JSON and PNG chunks, using repo-relative paths. | Ready | Needs one manifest format that works beyond images. |
| MCP and agent routes | Local guide/manifest routes, generation, batch, tools, glyph vectorization, output recovery, and dashboard context exist. | Ready for local BFL workflows | Needs prompt asset CRUD, asset import, live refresh, and richer job manifests. |
| Official FLUX MCP pairing | Official hosted MCP can handle direct BFL creative operations while the local surface keeps outputs visible in this repo. | Ready | Keep the two surfaces paired instead of wrapping one inside the other for now. |
| Provider registry | BFL models and image tools are listed with endpoints and limits. | Partial | Generalize provider/model capabilities beyond BFL. |
| Audio prompt workflow | Audio sequence generation can compose large prompts and save them to the prompt library. | Partial | Generated prompts should become library assets with references and provenance. |
| Glyph/vector workflow | Local vectorization API and MCP tools create SVG plus PNG preview outputs that appear in the gallery. | Ready | Needs asset filters so glyphs do not crowd normal image review. |
| Secrets/config | Local env files are supported and ignored by git. A future desktop bridge could read from OS key storage server-side. | Partial | Browser UI should not store raw provider secrets as asset data. |

## Asset Registry Shape

The next schema pass should keep the existing image records working while adding
an explicit asset type layer:

```json
{
  "id": "asset_...",
  "assetType": "image",
  "kind": "output",
  "role": "character",
  "provider": "bfl",
  "model": "flux-2-pro-preview",
  "operation": "generate",
  "handles": ["@img1"],
  "sourceAssetIds": [],
  "derivedAssetIds": [],
  "files": {
    "preview": "outputs/...",
    "source": "outputs/...",
    "metadata": "outputs/...",
    "prompt": "outputs/...",
    "svg": null,
    "step": null,
    "glb": null
  },
  "provenance": {
    "prompt": "...",
    "settings": {},
    "references": []
  }
}
```

Recommended asset types:

- `image`
- `prompt`
- `mask`
- `audio`
- `video`
- `model3d`
- `cad`
- `shader`
- `scene`
- `collection`

For the BFL-first pass, only `image`, `prompt`, and `mask` need UI polish. The
other types can exist as reserved enum values and manifest fields until their
tabs are real.

## Prompt Assets

Generated prompts should become first-class assets, especially prompts produced
from audio sequences.

A prompt asset should preserve:

- the final provider-ready prompt text;
- source prompt blocks or composer inputs;
- linked images and their roles;
- audio markers or sequence rows when audio generated the prompt;
- target provider/model assumptions;
- output ids created from that prompt.

This lets an agent say "use this prompt with these two images" and lets the UI
show that prompt in the same library/history model as generated images.

## MCP Direction

Keep two complementary MCP surfaces:

- Official FLUX MCP for BFL-hosted account operations, direct generation, and
  provider-native history.
- Local dashboard MCP for local assets, prompt library operations, references,
  glyphs, BFL API route calls, and outputs that must appear in the gallery.

The local MCP should gradually move from route wrappers toward job-manifest
execution:

```text
agent request
  -> local MCP tool
  -> job manifest
  -> provider/local executor
  -> output asset records
  -> gallery refresh
```

This is better than forcing the local MCP to wrap the hosted FLUX MCP. Both can
be available to the same agent, and the agent can choose the right surface for
the job.

## Later Provider Lanes

These should be treated as modular providers that return assets to the same
library:

- Text-to-CAD: input prompt or structured parameters, output STEP/STL/GLB plus
  preview image and metadata.
- Faceplate maker: structured dimensions and controls, output CAD/model files
  plus rendered previews.
- Character face maker: guided controls and references, output images or 3D
  assets with prompt/settings provenance.
- Three.js object builder: local scene/object provider, output GLB or scene
  metadata plus preview.
- Audio-reactive world lane: audio, scene, shader, and recording assets that can
  feed video models later.

The public BFL repo can reserve the provider/asset hooks for these without
shipping the full broader world system in the first release.

## Open Source Hygiene

- Keep generated media under ignored output folders unless a file is deliberately
  curated as a small sample.
- Keep private prompts out of git; include only example prompts that are useful
  for users.
- Store paths in metadata as repo-relative paths.
- Do not commit API keys, account ids, local usernames, local absolute paths, or
  provider secrets.
- Keep output metadata useful enough for reproducibility: prompt, settings,
  model, provider, references, operation, and source asset ids.

## Suggested Next Pass

1. Add `assetType` and a compatibility adapter for existing image records.
2. Promote generated audio-sequence prompts into `prompt` assets.
3. Add asset filters in the library, defaulting to images.
4. Add stable handles and badges for images and prompts.
5. Add a small job manifest writer for BFL generation, image tools, and glyphs.
6. Extend the local MCP with prompt asset and asset import tools.
7. Add live refresh for agent-created assets.
8. Revisit settings and secure local key handling as a separate security pass.

