import type { PromptRecord } from "./types";

export type ComboMode = "morph" | "hybrid" | "stack";

export type ComboEnvironmentOption = {
  id: string;
  name: string;
  description: string;
};

export type ComboSettings = {
  mode: ComboMode;
  definition: string;
  primaryLabel: string;
  secondaryLabel: string;
  linkPhrase: string;
  environment: string;
  environmentOptions: ComboEnvironmentOption[];
};

export const comboModeLabels: Record<ComboMode, string> = {
  morph: "Morph",
  hybrid: "Hybrid",
  stack: "Stack JSON"
};

export const defaultComboSettings: ComboSettings = {
  mode: "morph",
  definition: "A single invented cybernetic botanical organism",
  primaryLabel: "primary species/anatomy",
  secondaryLabel: "secondary species/anatomy",
  linkPhrase: "hybridized through an experimental botanical process with",
  environment: "jungle",
  environmentOptions: [
    {
      id: "jungle",
      name: "Jungle",
      description: "humid tropical jungle glasshouse, wet leaves, dense botanical atmosphere, soft green depth"
    },
    {
      id: "desert",
      name: "Desert",
      description: "arid desert conservatory, mineral sand, dry heat shimmer, sculptural cactus-like negative space"
    },
    {
      id: "lab",
      name: "Lab",
      description: "controlled botanical laboratory, clean specimen bay, glass vessels, precise clinical lighting"
    }
  ]
};

export function normalizeComboMode(value: unknown): ComboMode {
  return value === "hybrid" || value === "stack" || value === "morph" ? value : defaultComboSettings.mode;
}

function cleanSetting(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slugifyEnvironment(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "environment";
}

export function normalizeComboEnvironmentId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const clean = value.trim();
  const lower = clean.toLowerCase();
  if (/jungle|rainforest|glasshouse|greenhouse/.test(lower)) return "jungle";
  if (/desert|volcanic|arid|dune/.test(lower)) return "desert";
  if (/\blab\b|laboratory/.test(lower)) return "lab";
  return slugifyEnvironment(clean);
}

function titleCaseEnvironment(value: string) {
  const clean = value.trim().replace(/[_-]+/g, " ");
  if (!clean) return "Environment";
  return clean
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function defaultEnvironmentOption(id: string) {
  return defaultComboSettings.environmentOptions.find((option) => option.id === id);
}

function normalizeEnvironmentOption(value: unknown): ComboEnvironmentOption | null {
  if (typeof value === "string") {
    const id = normalizeComboEnvironmentId(value);
    if (!id) return null;
    const defaultOption = defaultEnvironmentOption(id);
    return defaultOption || { id, name: titleCaseEnvironment(value), description: value.trim() };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id =
    normalizeComboEnvironmentId(record.id) ||
    normalizeComboEnvironmentId(record.name) ||
    normalizeComboEnvironmentId(record.description);
  if (!id) return null;
  const defaultOption = defaultEnvironmentOption(id);
  const name = cleanSetting(record.name, defaultOption?.name || titleCaseEnvironment(id));
  const description = cleanSetting(record.description, defaultOption?.description || name);
  return { id, name, description };
}

export function comboEnvironmentLabel(value: string | ComboEnvironmentOption) {
  if (typeof value !== "string") return value.name;
  const defaultOption = defaultEnvironmentOption(normalizeComboEnvironmentId(value));
  if (defaultOption) return defaultOption.name;
  const clean = value.trim();
  if (!clean) return "";
  return clean;
}

export function normalizeComboSettings(value: Partial<ComboSettings> | null | undefined): ComboSettings {
  const environmentOptions = Array.isArray(value?.environmentOptions)
    ? value.environmentOptions
        .map(normalizeEnvironmentOption)
        .filter((option): option is ComboEnvironmentOption => Boolean(option))
    : [];
  const normalizedEnvironment = normalizeComboEnvironmentId(value?.environment);
  const byId = new Map<string, ComboEnvironmentOption>();
  defaultComboSettings.environmentOptions.forEach((option) => byId.set(option.id, option));
  environmentOptions.forEach((option) => byId.set(option.id, option));
  const orderedIds = uniqueText([
    ...environmentOptions.map((option) => option.id),
    normalizedEnvironment,
    ...defaultComboSettings.environmentOptions.map((option) => option.id)
  ]);
  const options = orderedIds
    .map((id) => byId.get(id))
    .filter((option): option is ComboEnvironmentOption => Boolean(option))
    .slice(0, 8);
  const environment = options.some((option) => option.id === normalizedEnvironment)
    ? normalizedEnvironment
    : options[0]?.id || defaultComboSettings.environment;
  return {
    mode: normalizeComboMode(value?.mode),
    definition: cleanSetting(value?.definition, defaultComboSettings.definition),
    primaryLabel: cleanSetting(value?.primaryLabel, defaultComboSettings.primaryLabel),
    secondaryLabel: cleanSetting(value?.secondaryLabel, defaultComboSettings.secondaryLabel),
    linkPhrase: cleanSetting(value?.linkPhrase, defaultComboSettings.linkPhrase),
    environment,
    environmentOptions: options
  };
}

export function selectedComboEnvironment(settingsInput?: Partial<ComboSettings>) {
  const settings = normalizeComboSettings(settingsInput);
  return settings.environmentOptions.find((option) => option.id === settings.environment) || settings.environmentOptions[0];
}

export function promptHeaderSummary(input: {
  fallbackId?: string;
  combo?: { mode: string; sources: string[] } | null;
  lightingLabel?: string;
  environmentLabel?: string;
}): string {
  const sourceCount = input.combo?.sources.length || 0;
  const base = input.combo
    ? `${comboModeLabels[normalizeComboMode(input.combo.mode)]} · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`
    : input.fallbackId?.trim() || "Generate";
  const applied = [input.lightingLabel, input.environmentLabel]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return applied.length ? `${base} + ${applied.join(" + ")}` : base;
}

export function parsePromptObject(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { scene: "cybernetic botanical specimen", subjects: [{ description: raw }] };
  }
}

export function promptSubjects(prompt: any) {
  return Array.isArray(prompt.subjects) ? prompt.subjects : [];
}

export function uniqueText(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export function combinations<T>(items: T[], size: number) {
  const result: T[][] = [];
  function visit(start: number, combo: T[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      combo.push(items[index]);
      visit(index + 1, combo);
      combo.pop();
    }
  }
  visit(0, []);
  return result;
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function comboIdFromPrompts(chosen: PromptRecord[], prefix = "combo") {
  const sourceSlug = chosen.map((record) => record.id.replace(/_0\d$/, "")).join("_x_");
  return `${prefix}_${sourceSlug}`.slice(0, prefix === "combo" ? 96 : 120);
}

type ParsedComboSource = {
  record: PromptRecord;
  prompt: any;
  anatomy: string;
};

function parsedComboSources(chosen: PromptRecord[]): ParsedComboSource[] {
  return chosen.map((record) => {
    const prompt = parsePromptObject(record.prompt);
    const anatomy = promptSubjects(prompt)[0]?.description || record.plant_form || record.species || record.id;
    return { record, prompt, anatomy };
  });
}

function sourceSpecies(source: ParsedComboSource) {
  return source.record.species || source.record.plant_form || source.record.id;
}

function sourceSummary(source: ParsedComboSource) {
  const species = sourceSpecies(source);
  return source.anatomy.includes(species) ? source.anatomy : `${species}; ${source.anatomy}`;
}

function sentenceLinkPhrase(value: string) {
  return value.replace(/^is\s+/i, "").trim();
}

function buildComboPromptCore(chosen: PromptRecord[], settingsInput?: Partial<ComboSettings>) {
  const settings = normalizeComboSettings(settingsInput);
  const environmentOption = selectedComboEnvironment(settings);
  const parsed = parsedComboSources(chosen);
  const promptsOnly = parsed.map((item) => item.prompt);
  const descriptions = parsed.map((source) => source.anatomy).filter(Boolean);
  const species = uniqueText(chosen.map((record) => record.species));
  const forms = uniqueText(chosen.map((record) => record.plant_form));
  const environments = uniqueText([environmentOption.description, ...promptsOnly.map((prompt) => prompt.environment)]);
  const lightings = uniqueText(promptsOnly.map((prompt) => prompt.lighting));
  const styles = uniqueText(promptsOnly.map((prompt) => prompt.style));
  const materials = uniqueText(promptsOnly.map((prompt) => prompt.materials));

  return { settings, environmentOption, parsed, promptsOnly, descriptions, species, forms, environments, lightings, styles, materials };
}

export function buildMorphComboPrompt(chosen: PromptRecord[], settingsInput?: Partial<ComboSettings>) {
  const { settings, parsed, environments, lightings, styles, materials } = buildComboPromptCore(chosen, settingsInput);
  const [primary, ...secondarySources] = parsed;
  const secondary = secondarySources.length ? secondarySources : parsed.slice(0, 1);
  const primaryText = primary ? sourceSummary(primary) : "selected botanical source";
  const secondaryText = secondary.map(sourceSummary).join("; ");
  const lighting = lightings.join(" blended with ") || "cinematic macro light with readable surface detail";
  const style =
    styles[0] ||
    "cinematic detailed film photography, botanical macro film still, natural grain, premium source-image quality";
  const materialCue =
    materials[0] ||
    "believable transitions between living plant tissue, translucent membranes, wet organic texture, and cybernetic detail";

  return [
    `${settings.definition}.`,
    `A (${settings.primaryLabel}) is ${primaryText}.`,
    `B (${settings.secondaryLabel}) is ${secondaryText}.`,
    `A is ${sentenceLinkPhrase(settings.linkPhrase)} B, forming one coherent new species rather than a collage or multiple specimens.`,
    `Environment: ${environments[0] || settings.environment}.`,
    `Lighting: ${lighting}.`,
    `${style}.`,
    `Resolve the hybrid as integrated anatomy, appendages, membranes, vascular structures, and surface materials; ${materialCue}.`,
    "Macro specimen photograph, centered dominant subject, clean readable silhouette, stable crop margins, no text, no watermark."
  ].join(" ");
}

function buildHybridComboPromptObject(chosen: PromptRecord[], settingsInput?: Partial<ComboSettings>) {
  const { settings, environmentOption, parsed, promptsOnly, descriptions, species, forms, environments, lightings, styles, materials } =
    buildComboPromptCore(chosen, settingsInput);

  return {
    prompt_format: "json",
    scene:
      "animation-friendly specimen photograph of a single coherent hybrid on a clean plane, using either top-down, high side/top, or low underside reveal camera geometry",
    combo: {
      mode: "morphed source fusion",
      source_count: chosen.length,
      source_ids: chosen.map((record) => record.id),
      template: {
        definition: settings.definition,
        primary: settings.primaryLabel,
        link: settings.linkPhrase,
        secondary: settings.secondaryLabel,
        environment: environmentOption
      },
      directive:
        "Fuse the selected sources into one coherent hybrid, not a collage and not multiple separate specimens."
    },
    subjects: [
      {
        description: `${settings.definition} combining ${species.join(" + ") || "selected botanical species"}; ${descriptions.join("; ")}`,
        source_influences: parsed.map(({ record, anatomy }) => ({
          id: record.id,
          species: record.species,
          seed: record.seed,
          plant_form: record.plant_form,
          anatomy
        })),
        fused_anatomy: [
          "one readable main body with merged source anatomy",
          forms.length ? `combined forms: ${forms.join(" + ")}` : "",
          "membranes, tissue detail, surface materials, and living mechanical texture resolved as one organism"
        ]
          .filter(Boolean)
          .join("; "),
        position: "centered dominant specimen, readable at thumbnail size",
        action: "held still as a training-ready source image with recognizable combined anatomy"
      }
    ],
    style:
      styles.join(" + ") ||
      "cinematic detailed film photography, botanical macro film still, natural grain, premium source-image quality, creamy optical bokeh",
    environment: environments.join(" blended with "),
    lighting: lightings.join(" blended with "),
    composition:
      "clean readable hybrid silhouette against a simple plane, surface structure and material anatomy clearly visible, stable crop margins for animation, each selected plant influence visibly represented, room for reactive motion graphics; prefer top-down balanced or high side/top views, with occasional low underside reveal when the hybrid has translucent petals or glowing material detail",
    camera: promptsOnly.find((prompt) => prompt.camera)?.camera || {
      angle:
        "high three-quarter view from above, about 45 degrees off the specimen plane, showing both top anatomy and side depth",
      lens: "90mm macro lens with controlled perspective, stable tabletop framing",
      depth_of_field: "controlled macro depth with the upper surfaces and key side structures sharp for animation source use"
    },
    materials:
      materials.join(" + ") ||
      "believable transitions between living plant tissue, translucent membranes, wet organic texture, ceramic or metallic cybernetic detail",
    delivery:
      "clean unmarked label-free specimen image on a simple blank plane, stable centered framing, no text, no watermark, usable as source material for audiovisual reactive visuals"
  };
}

function buildStackComboPromptObject(chosen: PromptRecord[], settingsInput?: Partial<ComboSettings>) {
  const { settings, environmentOption, parsed, promptsOnly, descriptions, species, forms, environments, lightings, styles, materials } =
    buildComboPromptCore(chosen, settingsInput);

  return {
    prompt_format: "json",
    scene:
      "animation-friendly specimen photograph of a single coherent hybrid on a clean plane, using either top-down, high side/top, or low underside reveal camera geometry",
    combo: {
      mode: "stacked-source fusion",
      source_count: chosen.length,
      source_ids: chosen.map((record) => record.id),
      template: {
        definition: settings.definition,
        primary: settings.primaryLabel,
        link: settings.linkPhrase,
        secondary: settings.secondaryLabel,
        environment: environmentOption
      },
      directive:
        "Fuse the selected sources into one coherent hybrid, not a collage and not multiple separate specimens."
    },
    subjects: [
      {
        description: `single coherent hybrid combining ${species.join(" + ") || "selected sources"}; ${descriptions.join("; ")}`,
        source_influences: parsed.map(({ record, anatomy }) => ({
          id: record.id,
          species: record.species,
          seed: record.seed,
          plant_form: record.plant_form,
          anatomy
        })),
        fused_anatomy: [
          "one readable main body with merged source anatomy",
          forms.length ? `combined forms: ${forms.join(" + ")}` : "",
          "membranes, tissue detail, surface materials, and living mechanical texture resolved as one organism"
        ]
          .filter(Boolean)
          .join("; "),
        position: "centered dominant specimen, readable at thumbnail size",
        action: "held still as a training-ready source image with recognizable combined anatomy"
      }
    ],
    style:
      styles.join(" + ") ||
      "cinematic detailed film photography, botanical macro film still, natural grain, premium source-image quality, creamy optical bokeh",
    environment: environments.join(" blended with "),
    lighting: lightings.join(" blended with "),
    composition:
      "clean readable hybrid silhouette against a simple plane, surface structure and material anatomy clearly visible, stable crop margins for animation, each selected plant influence visibly represented, room for reactive motion graphics; prefer top-down balanced or high side/top views, with occasional low underside reveal when the hybrid has translucent petals or glowing material detail",
    camera: promptsOnly.find((prompt) => prompt.camera)?.camera || {
      angle:
        "high three-quarter view from above, about 45 degrees off the specimen plane, showing both top anatomy and side depth",
      lens: "90mm macro lens with controlled perspective, stable tabletop framing",
      depth_of_field: "controlled macro depth with the upper surfaces and key side structures sharp for animation source use"
    },
    materials:
      materials.join(" + ") ||
      "believable transitions between living plant tissue, translucent membranes, wet organic texture, ceramic or metallic cybernetic detail",
    delivery:
      "clean unmarked label-free specimen image on a simple blank plane, stable centered framing, no text, no watermark, usable as source material for audiovisual reactive visuals",
    combo_sources: chosen.map((record) => ({
      id: record.id,
      species: record.species,
      seed: record.seed,
      plant_form: record.plant_form,
      prompt: parsePromptObject(record.prompt)
    }))
  };
}

export function buildComboPromptObject(chosen: PromptRecord[], options: { mode?: ComboMode; settings?: Partial<ComboSettings> } = {}) {
  const mode = normalizeComboMode(options.mode ?? options.settings?.mode);
  return mode === "stack"
    ? buildStackComboPromptObject(chosen, options.settings)
    : buildHybridComboPromptObject(chosen, options.settings);
}

export function comboPromptFormat(mode: ComboMode) {
  return mode === "morph" ? "natural" : "json";
}

export function buildComboPrompt(chosen: PromptRecord[], options: { mode?: ComboMode; settings?: Partial<ComboSettings> } = {}) {
  const settings = normalizeComboSettings(options.settings);
  const mode = normalizeComboMode(options.mode ?? settings.mode);
  if (mode === "morph") return buildMorphComboPrompt(chosen, settings);
  return JSON.stringify(buildComboPromptObject(chosen, { mode, settings }), null, 2);
}
