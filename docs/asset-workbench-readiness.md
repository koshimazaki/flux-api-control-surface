# Asset Workbench Readiness

Date: 2026-06-19
Status: public-safe readiness note

This note assesses how ready the FLUX API Control Surface is to ship as a
focused local BFL asset workbench.

The recommended near-term scope is still simple: prompts and images. The app can
reserve clean extension points for audio, video, CAD, 3D, shaders, scenes, and
other local experiments, but the public version should make the BFL image and
prompt loop feel solid before expanding the visible product.

## Direction

Keep BFL as the whole first public surface.

The public tool should remain:

- a FLUX/BFL prompt and image control surface;
- a local asset library for generated images, imported references, glyphs, and
  reusable prompts;
- an agent-friendly bridge between the official FLUX MCP and local UI-visible
  outputs;
- a lightweight BFL job/asset record system only where it makes local workflows
  easier to repeat.

Text-to-CAD, faceplate makers, character face makers, Three.js object builders,
and audio-reactive world tools are useful future experiments, but they should
stay out of the BFL repo's public positioning until a concrete local workflow
needs them.

## Current Readiness

| Area | Current state | Readiness | Main gap |
|---|---|---:|---|
| Image assets | Generated outputs, imported images, references, tool outputs, glyph previews, local JSON/prompt files, PNG metadata, and optional remote archive records. | Ready | Asset schema is still image-shaped. |
| Prompt library | Editable prompt records, prompt domains, gallery prompt capture, and audio-sequence "Save to library". | Usable | Prompts are not yet first-class assets in the shared gallery. |
| References | Gallery cards can be reused as image references with roles such as character, style, environment, pose, and loose. | Ready for images | Needs stable handle badges like `@img1` and `@prompt1`. |
| Metadata | Outputs preserve prompt/settings metadata in JSON and PNG chunks, using repo-relative paths. | Ready | Needs one manifest format that works beyond images. |
| MCP and agent routes | Local guide/manifest routes, stdio MCP wrapper, generation, batch, tools, prompt save/delete, reference archive sync, glyph vectorization, output recovery, credits, caption job prep, and dashboard context exist. | Ready for local BFL workflows | Binary audio export, browser drag/drop, mask painting, waveform analysis, and live React control remain UI/HTTP/browser-automation workflows. |
| Official FLUX MCP pairing | Official hosted MCP can handle direct BFL creative operations while the local surface keeps outputs visible in this repo. | Ready | Keep the two surfaces paired instead of wrapping one inside the other for now. |
| BFL model/tool registry | BFL models and image tools are listed with endpoints and limits. | Ready | Keep it BFL-specific unless a concrete integration needs another adapter. |
| Audio prompt workflow | Audio sequence generation can compose large prompts and save them to the prompt library. | Partial | Generated prompts should become library assets with references and provenance. |
| Glyph/vector workflow | Local vectorization API and MCP tools create SVG plus PNG preview outputs that appear in the gallery. | Ready | Needs asset filters so glyphs do not crowd normal image review. |
| Secrets/config | Local env files are supported and ignored by git. The dashboard can also store the local FLUX key in macOS Keychain and resolve it server-side. | Ready for local macOS workflows | Non-macOS users still need env vars or another local secret store. |

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

- the final BFL-ready prompt text;
- source prompt blocks or composer inputs;
- linked images and their roles;
- audio markers or sequence rows when audio generated the prompt;
- target BFL model assumptions;
- output ids created from that prompt.

This lets an agent say "use this prompt with these two images" and lets the UI
show that prompt in the same library/history model as generated images.

## MCP Direction

Keep two complementary MCP surfaces:

- Official FLUX MCP for BFL-hosted account operations, direct generation, and
  BFL-native history.
- Local dashboard MCP for local assets, prompt library operations, references,
  glyphs, BFL API route calls, and outputs that must appear in the gallery.

The local MCP can move from route wrappers toward a small BFL job manifest if it
reduces duplicated batch/tool code:

```text
agent request
  -> local MCP tool
  -> job manifest
  -> BFL/local executor
  -> output asset records
  -> gallery refresh
```

This is better than forcing the local MCP to wrap the hosted FLUX MCP. Both can
be available to the same agent, and the agent can choose the right surface for
the job.

## Out-Of-Scope Experiments

These can stay in notes or separate experiments until they need real BFL
workbench integration:

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

The public BFL repo should not market these as supported surfaces until they are
real workflows.

## Open Source Hygiene

- Keep generated media under ignored output folders unless a file is deliberately
  curated as a small sample.
- Keep private prompts out of git; include only example prompts that are useful
  for users.
- Store paths in metadata as repo-relative paths.
- Do not commit API keys, account ids, local usernames, local absolute paths, or
  paid-service secrets.
- Keep output metadata useful enough for reproducibility: prompt, settings,
  model, BFL/provider label, references, operation, and source asset ids.

## Suggested Next Pass

1. Add `assetType` and a compatibility adapter for existing image records.
2. Promote generated audio-sequence prompts into `prompt` assets.
3. Add asset filters in the library, defaulting to images.
4. Add stable handles and badges for images and prompts.
5. Add a small BFL job manifest writer only if it removes duplicated
   generation/tool/glyph code.
6. Extend the local MCP with a deliberate asset import path.
7. Add live refresh for agent-created assets.
8. Add a settings surface for key status and local storage choice.
