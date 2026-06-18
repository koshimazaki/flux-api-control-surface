# FLUX API Control Surface Open Source Release Scope

Date: 2026-06-15
Status: release-scope note

The public release should stay focused on the FLUX API Control Surface as a useful
community tool. It can include FLUX API workflows, local agent/MCP-facing HTTP
routes, prompt/reference workflows, image tool workspaces, local-first output
storage, and safe Cloudflare archive support.

The larger closed creative system can reuse this control surface as a component,
but should not be shipped as part of the first open-source release.

## Public Scope

Include:

- FLUX image generation through official API routes.
- FLUX Erase, Inpaint/Fill, and Outpaint tool routes.
- Native BFL MCP setup notes and local `/api/mcp/manifest` route map.
- Local agent/API routes for prompt discovery, run planning, batch execution,
  credits, output hydration, reference archive sync, audio guide/slice export,
  and FLUX image tools.
- Prompt library save flows, including generated audio sequence prompts and
  gallery prompts.
- Reference image slots, gallery reference badges, draggable image references,
  and provenance on tool outputs.
- Local-first storage with optional token-protected R2/D1 archive.
- Clear public release gate, setup docs, `.env.example`, and sample-safe usage.

## Out Of Scope / Later

Do not include in the first open-source release:

- Local 3D world recorder/control integration.
- Full shader editor integration beyond audio guide export already present.
- Provider-agnostic closed orchestration across fal, Seedance, RunPod, Comfy,
  custom models, or project-specific LoRA workflows.
- Closed-source job manifest executor for larger world-model/video pipelines.
- Relationship, outreach, application, account, or client context.

## Positioning

Public framing:

```text
An open local control surface for exploring FLUX API workflows with prompt
libraries, reference assets, image tools, output provenance, and agent-friendly
local routes.
```

Internal framing:

```text
The FLUX API Control Surface becomes one open component inside a larger closed creative
system for audio-reactive worlds, local 3D captures, model-provider routing,
RunPod execution, and world/video LoRA experiments.
```

## Release Readiness Checklist

- Confirm `npm run build` passes.
- Smoke-test generate, Erase, Inpaint/Fill, Outpaint, prompt save, reference
  badges, output recovery, and MCP manifest routes.
- Scrub `.env.local`, output media, logs, account balances, API keys, nonpublic
  prompts, and nonpublic notes.
- Keep generated outputs out of git unless they are curated samples.
- Decide whether to push as public immediately or publish a tagged release after
  a short limited beta.
- Prepare a short LinkedIn post that frames the release as a community FLUX
  workflow tool, not a hosted generator.
