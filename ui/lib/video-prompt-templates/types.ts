import type { VideoPromptCategory } from "@/lib/types";

/**
 * Starter video prompt template packs.
 *
 * These are generic, public-safe scaffolds written for this repository: a shape
 * to fill in rather than a finished prompt. No private batch prompt, client
 * brief, or experiment log is bundled here, and none should ever be added — the
 * packs exist so a new video prompt is completed, not typed from scratch.
 *
 * Every template body is `{placeholder}` text. `compileVideoPromptTemplate`
 * fills the blanks; anything left unfilled is caught by the placeholder guard
 * before a paid generation.
 */

export type VideoPromptStylePreset = {
  id: string;
  label: string;
  /** Substituted into `{style}` by the Simple-category quick buttons. */
  value: string;
};

/** One-click `{style}` fills for the short "animate this in {style}" prompts. */
export const VIDEO_STYLE_PRESETS: VideoPromptStylePreset[] = [
  { id: "studio", label: "Studio", value: "clean studio style, seamless backdrop, controlled key and fill light" },
  {
    id: "cinematic",
    label: "Cinematic",
    value: "cinematic style, shallow depth of field, motivated key light, wide framing"
  },
  { id: "film", label: "Film", value: "35mm film style, fine grain, soft halation, natural color response" },
  { id: "anime", label: "Anime", value: "hand-drawn anime style, cel shading, clean line art, painted backgrounds" },
  {
    id: "documentary",
    label: "Documentary",
    value: "observational documentary style, handheld camera, available light, honest color"
  },
  {
    id: "stop-motion",
    label: "Stop-motion",
    value: "stop-motion style, handmade materials, slight frame-to-frame jitter, practical miniature lighting"
  }
];

/**
 * Keyframes are addressed by position, never by content. A prompt that says
 * "image 2" stays correct when the batch permutes, swaps, or regenerates which
 * asset sits in slot 2 — a prompt that names the picture does not.
 */
export const POSITIONAL_IMAGE_CONVENTION =
  'Refer to keyframes by position — "image 1", "image 2" — so permuted or swapped keyframes keep this prompt valid.';

export type VideoPromptCategoryInfo = {
  id: VideoPromptCategory;
  label: string;
  blurb: string;
};

/** Menu order and copy for the four video categories in the PRD's library menu. */
export const VIDEO_PROMPT_CATEGORIES: VideoPromptCategoryInfo[] = [
  { id: "simple", label: "Simple", blurb: "One-line animate prompts with a style quick-fill." },
  { id: "detailed", label: "Detailed", blurb: "Full shot specs: framing, lens, light, motion, finish." },
  { id: "sequence", label: "Beat / Sequence", blurb: "Timed beat sheets that mirror a keyframe timeline." },
  { id: "dialogue_sound", label: "Dialogue & Sound", blurb: "Spoken lines, voice-over, and designed sound." }
];

/**
 * Structured sections as authored, before compilation. Beats are plain strings
 * here (they still hold `{t1}` blanks); compiling parses their leading seconds
 * into the numeric `start` of a `VideoPromptBeat`.
 */
export type VideoPromptTemplateStructure = {
  setup?: string;
  beats?: string[];
  camera?: string;
  dialogue?: string;
  sound?: string;
  ambience?: string;
};

export type VideoPromptTemplate = {
  id: string;
  name: string;
  category: VideoPromptCategory;
  summary: string;
  /** The compiled prompt body. Carries `{placeholder}` blanks. */
  body: string;
  tags: string[];
  /** Example text shown in each blank's input; never auto-filled. */
  hints?: Record<string, string>;
  structure?: VideoPromptTemplateStructure;
};

