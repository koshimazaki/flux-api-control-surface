# Creator Workbench Architecture

Date: 2026-06-13
Status: draft concept note

This note sketches a shared creative workbench for the existing FLUX API Control Surface,
audio-reactive shader tool, local 3D world recorder, and downstream video/model
providers. The first implementation can stay BFL-native because that is the
current working surface, but the architecture should be provider-agnostic.

## Core Idea

Keep the individual engines separate, but give them one shared shell:

- BFL / FLUX image generation and image-tool workspaces
- Audio-reactive shader presets and recorder
- Local 3D / React Three Fiber scene, camera, character, and recorder
- LTX, fal, Seedance-style video models, RunPod sessions, local Comfy, and
  custom model endpoints

The shell provides the human UI, project memory, asset library, job manifests,
run history, and MCP/agent control surface. The engines remain swappable modules.

## Shared Layer

The shared layer should own:

- Asset library: images, videos, audio, masks, shader presets, scene presets,
  prompts, and outputs.
- Reference handles: stable prompt-facing handles such as `@prompt1`, `@img1`,
  `@video1`, `@audio1`, `@mask1`, `@shader1`, and `@scene1`.
- Provider registry: `bfl`, `fal`, `seedance`, `runpod`, `local`, etc.
- Model registry inside providers: for example `bfl/flux-2-max`,
  `fal/ltx-audio-reactive-lora`, `runpod/flags-big`, or `local/shader-render`.
- Job manifests: JSON files that describe selected assets, prompt blocks,
  provider/model choice, settings, and desired output.
- Run history: raw job, resolved provider request, logs, outputs, metrics, and
  links back to all referenced assets.
- MCP/agent API: a machine-facing way to alter parameters, combine prompts,
  route audio, record shaders, control local world scenes, run inference, and return
  assets to the library.

## Job Flow

```text
User or agent selects assets
  -> UI writes a job manifest
  -> agent or provider adapter executes it
  -> output assets and logs return to the library
  -> manifest becomes reproducible dataset/eval/training metadata
```

Example manifest shape:

```json
{
  "provider": "fal",
  "model": "ltx-audio-reactive-lora",
  "inputs": {
    "prompt": "@prompt1",
    "images": ["@img1", "@img2"],
    "videoGuide": "@video1",
    "audio": "@audio1",
    "scene": "@scene1"
  },
  "settings": {
    "duration": 8,
    "aspectRatio": "1:1",
    "seed": 12345
  },
  "outputs": {
    "target": "library"
  }
}
```

The UI does not need to be the compute surface. Execution can happen through
official APIs, a local endpoint, a RunPod session, or a cloud skill. The UI's
main job is to capture intent and preserve state.

## Shader To Local 3D

Shader presets should export three useful forms:

1. Video asset: render MP4/WebM, save to the library, use directly as a model
   guide or place on a local 3D screen.
2. R3F material asset: when portable, wrap the shader as a Three.js material on
   a plane, cube, sphere, portal, sky, or other simple object.
3. Proxy scene asset: export metadata describing shape, palette, beat routes,
   and motion behavior. The local 3D scene can spawn an equivalent object such as a blob,
   cube cluster, bouncing spheres, emissive plane, or particle field.

Exact visual equivalence is not required for the proxy path. The important part
is preserving the control meaning: timing, motion, color, scene role, and audio
reactivity. Video models can reinterpret the proxy object into a more specific
subject later.

## Runtime And Memory Management

Because shaders, local 3D recording, video recording, and audio analysis all touch heavy
browser resources, the shell should lazy-mount modules and expose simple switches:

- Active module: BFL workbench, shader lab, local world, audio, recorder.
- Inactive WebGL canvases pause or unmount.
- One shared audio analysis service feeds shader and local world routes when both
  are active.
- Large generated media stays outside git and is referenced by manifest IDs.
- Provider credentials stay local or server-side and are never written into
  manifests.

## Provider Strategy

Use official APIs whenever access exists. Use owned/local APIs for custom models,
RunPod sessions, Comfy workflows, shader rendering, audio analysis, and local world
recording. Browser automation of subscription websites is intentionally out of
scope for the main architecture.

This keeps the workbench professional and portable:

```text
dashboard intent + asset memory
  -> provider/model adapter
  -> official API, own API, local tool, or RunPod session
  -> output and manifest back to library
```

## First Implementation Pass

Start from the existing FLUX API Control Surface because it already has the prompt,
reference, asset, output, and API surface.

Near-term steps:

1. Keep the visible product BFL-native while naming internals around
   providers/models rather than BFL-only concepts.
2. Add a provider/model registry and a job manifest writer before broad visual
   redesign.
3. Treat the shader tool and local world recorder as local providers:
   `local/shader-render` and `local/world-record`.
4. Add shared reference handles for prompt blocks, image refs, video guides,
   audio, masks, shader presets, and scene presets.
5. Produce one end-to-end proof:
   BFL image refs + audio-reactive shader/control video + local 3D take +
   LTX/fal/RunPod inference + returned output manifest.

## Proof Target

The strongest public proof is not a generic dashboard. It is a controllable
world-to-video workflow:

```text
game/world scene
  -> audio-reactive objects, shader guides, camera/character direction
  -> recorded guide clips
  -> model pass with image/style references
  -> animated shot outputs
  -> reusable dataset/eval/training bundle
```

This positions the workbench as a production console for audio-authored visual
generation, not just a collection of separate tools.

## Follow-Up Notes

- [`2026-06-13 - Creator Workbench Bugs And UX Backlog`](./2026-06-13-workbench-bugs-ux-backlog.md)
- [`2026-06-15 - FLUX API Control Surface Release Scope`](./2026-06-15-flux-api-control-surface-release-scope.md)
