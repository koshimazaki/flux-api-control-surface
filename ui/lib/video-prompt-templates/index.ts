import { compilePromptText, extractPlaceholders } from "@/lib/prompt-placeholders";
import type { VideoPromptBeat, VideoPromptCategory, VideoPromptStructure } from "@/lib/types";
import { VIDEO_PROMPT_TEMPLATES } from "./packs";
import { VIDEO_STYLE_PRESETS } from "./types";
import type { VideoPromptTemplate, VideoPromptTemplateStructure } from "./types";

/**
 * Video prompt template packs: shipped starter templates plus the fill-in
 * compilation that turns one into a finished prompt. Unfilled `{placeholder}`
 * blanks are reported, never silently dropped, so the guard can block them.
 */
export { VIDEO_PROMPT_TEMPLATES } from "./packs";
export {
  POSITIONAL_IMAGE_CONVENTION,
  VIDEO_PROMPT_CATEGORIES,
  VIDEO_STYLE_PRESETS
} from "./types";
export type {
  VideoPromptCategoryInfo,
  VideoPromptStylePreset,
  VideoPromptTemplate,
  VideoPromptTemplateStructure
} from "./types";

/**
 * Applies a style preset to composer text: fills `{style}` when the template
 * still has that blank, otherwise appends the phrase as its own clause. Text
 * that already carries the phrase is returned untouched.
 */
export function applyStylePreset(text: string, style: string): string {
  const phrase = style.trim();
  if (!phrase) return text;
  if (/\{style\}/.test(text)) return text.replace(/\{style\}/g, phrase);
  const trimmed = (text || "").trim();
  if (!trimmed) return `${phrase}.`;
  if (trimmed.includes(phrase)) return text;
  return /[.!?]$/.test(trimmed) ? `${trimmed} ${phrase}.` : `${trimmed}, ${phrase}.`;
}

/** True when the composer text already carries this preset's phrase. */
export function isStylePresetActive(text: string, style: string): boolean {
  const phrase = style.trim();
  return Boolean(phrase) && (text || "").includes(phrase);
}

function stripStylePhrase(text: string, phrase: string): string {
  let next = text.split(`, ${phrase}.`).join(".");
  next = next.split(` ${phrase}.`).join(".");
  next = next.split(`${phrase}.`).join("");
  next = next.split(`, ${phrase}`).join("");
  next = next.split(phrase).join("");
  return next
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/(^|\n)[ \t]*\.[ \t]*(?=\n|$)/g, "$1")
    .trimEnd();
}

/**
 * Style quick-buttons behave like a radio group with an off state: clicking
 * the active preset removes its phrase, clicking a different one replaces
 * whichever preset phrase is present, and the first click fills `{style}`
 * when the template still carries that blank. Styles accumulate only if the
 * user types them by hand.
 */
export function toggleStylePreset(text: string, style: string): string {
  const phrase = style.trim();
  if (!phrase) return text;
  if (isStylePresetActive(text, phrase)) return stripStylePhrase(text || "", phrase);
  let next = text || "";
  for (const preset of VIDEO_STYLE_PRESETS) {
    if (preset.value !== phrase && isStylePresetActive(next, preset.value)) {
      next = stripStylePhrase(next, preset.value);
    }
  }
  return applyStylePreset(next, phrase);
}

export function videoPromptTemplates(category?: VideoPromptCategory): VideoPromptTemplate[] {
  return category ? VIDEO_PROMPT_TEMPLATES.filter((template) => template.category === category) : VIDEO_PROMPT_TEMPLATES;
}

export function findVideoPromptTemplate(id: string): VideoPromptTemplate | undefined {
  return VIDEO_PROMPT_TEMPLATES.find((template) => template.id === id);
}

/** Every blank in the body and the structured sections, in body-first order. */
export function videoTemplatePlaceholders(template: VideoPromptTemplate): string[] {
  const structure = template.structure;
  const sections = [
    structure?.setup,
    ...(structure?.beats ?? []),
    structure?.camera,
    structure?.dialogue,
    structure?.sound,
    structure?.ambience
  ].filter((value): value is string => Boolean(value));
  return extractPlaceholders([template.body, ...sections].join("\n"));
}

/** Parses a compiled beat line such as `3s: the tool meets the material`. */
function compileBeat(line: string, values: Record<string, string | undefined>): VideoPromptBeat {
  const compiled = compilePromptText(line, values).trim();
  const match = compiled.match(/^(\d+(?:\.\d+)?)\s*s\s*[:\-–]\s*(.*)$/);
  if (!match) return { text: compiled };
  return { start: Number(match[1]), text: match[2].trim() };
}

function compileStructure(
  structure: VideoPromptTemplateStructure | undefined,
  values: Record<string, string | undefined>
): VideoPromptStructure | undefined {
  if (!structure) return undefined;
  const compiled: VideoPromptStructure = {};
  if (structure.setup) compiled.setup = compilePromptText(structure.setup, values);
  if (structure.beats?.length) compiled.beats = structure.beats.map((line) => compileBeat(line, values));
  if (structure.camera) compiled.camera = compilePromptText(structure.camera, values);
  if (structure.dialogue) compiled.dialogue = compilePromptText(structure.dialogue, values);
  if (structure.sound) compiled.sound = compilePromptText(structure.sound, values);
  if (structure.ambience) compiled.ambience = compilePromptText(structure.ambience, values);
  return Object.keys(compiled).length ? compiled : undefined;
}

export type CompiledVideoPrompt = {
  templateId: string;
  templateName: string;
  category: VideoPromptCategory;
  /** Compiled prompt text. May still contain blanks — check `pending`. */
  text: string;
  structure?: VideoPromptStructure;
  tags: string[];
  values: Record<string, string>;
  /** Placeholders still unfilled. Non-empty means this must not be enqueued. */
  pending: string[];
};

/**
 * Fills a template's blanks. Unfilled blanks stay in the text and are reported
 * in `pending`, so the caller can block the compiled prompt at its boundary.
 */
export function compileVideoPromptTemplate(
  template: VideoPromptTemplate,
  values: Record<string, string | undefined>
): CompiledVideoPrompt {
  const kept: Record<string, string> = {};
  for (const name of videoTemplatePlaceholders(template)) {
    const value = values[name];
    if (typeof value === "string" && value.trim()) kept[name] = value.trim();
  }
  const text = compilePromptText(template.body, kept);
  return {
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    text,
    structure: compileStructure(template.structure, kept),
    tags: template.tags,
    values: kept,
    pending: extractPlaceholders(text)
  };
}
