export const presets = [
  {
    id: "magic",
    label: "Magic Hour",
    style:
      "cinematic detailed film photography, botanical macro film still, shot on Kodak Portra 400, natural grain, organic color, high dynamic range",
    lighting: "magic hour backlight, warm rim light, soft haze, luminous surface glow, creamy bokeh highlights",
    lens: "100mm macro lens at f/2.8, shallow depth of field, circular bokeh, sharp anatomy at the focal plane"
  },
  {
    id: "cinema",
    label: "Cinematic",
    style:
      "cinematic large-format botanical photography, premium production still, tactile macro realism, subtle film grain, rich color separation",
    lighting: "dramatic cinematic side light, controlled contrast, wet specular highlights, soft background falloff",
    lens: "Hasselblad X2D, 80mm lens at f/2.8, close-focus macro perspective, smooth bokeh"
  },
  {
    id: "moon",
    label: "Moonlit",
    style:
      "nocturnal cinematic macro photography, gothic botanical realism, velvet shadows, fine film grain, luminous biological detail",
    lighting: "blue moonlight with a faint magenta rim light, bioluminescent surface glow, dark soft bokeh",
    lens: "Canon 5D Mark IV, 100mm macro lens, f/2.8, shallow depth of field, crisp petal texture at the focal plane"
  }
];

export const defaultReferenceCue =
  "Use the attached reference role map as binding intent: @char controls identity, @style1 and @style2 control aesthetic, @env controls world/setting, @pose controls posture and camera, and @img or @image references are secondary visual accents. Older @character, @style, @environment, @extra, and @loose tokens mean the same roles. Numbered @img1, @img2, and similar tokens refer to exact image slots. When prompt text mentions a role token or numbered image token, obey that token-specific instruction over the default slot order.";

type PromptPreset = (typeof presets)[number];

export function formatPrompt(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function compactPrompt(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return raw;
  }
}

export const referenceRolesPromptPrefix = "Reference roles:";

export const fallbackReferenceCue = "Use supplied images as visual references while preserving the prompt subject.";

export function composeReferencePrompt(baseText: string, referenceCue: string | undefined, hasReferences: boolean) {
  const base = compactPrompt(baseText);
  if (!hasReferences) return base;
  const cue = referenceCue?.trim() || fallbackReferenceCue;
  return `${base}\n\n${referenceRolesPromptPrefix} ${cue}`;
}

export function stripReferenceCue(prompt: string) {
  const marker = `\n\n${referenceRolesPromptPrefix}`;
  const markerIndex = prompt.indexOf(marker);
  return markerIndex >= 0 ? prompt.slice(0, markerIndex) : prompt;
}

function cameraPatchForPreset(preset: PromptPreset) {
  return {
    lens: preset.lens,
    depth_of_field: "creamy cinematic bokeh with the main botanical anatomy sharply resolved"
  };
}

function applyPresetFields(prompt: Record<string, any>, preset: PromptPreset) {
  prompt.style = preset.style;
  prompt.lighting = preset.lighting;
  prompt.camera = {
    ...(prompt.camera && typeof prompt.camera === "object" && !Array.isArray(prompt.camera) ? prompt.camera : {}),
    ...cameraPatchForPreset(preset)
  };
  prompt.mood = "strange sacred-plant atmosphere, tactile, elegant, filmic";
}

function applyPresetToPromptObject(prompt: unknown, preset: PromptPreset) {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) return;
  const record = prompt as Record<string, any>;
  applyPresetFields(record, preset);

  if (Array.isArray(record.combo_sources)) {
    record.combo_sources.forEach((source) => {
      if (source && typeof source === "object" && !Array.isArray(source)) {
        applyPresetToPromptObject((source as Record<string, any>).prompt, preset);
      }
    });
  }
}

function applyEnvironmentToPromptObject(prompt: unknown, environment: string) {
  if (!prompt || typeof prompt !== "object" || Array.isArray(prompt)) return;
  const record = prompt as Record<string, any>;
  record.environment = environment;

  if (Array.isArray(record.combo_sources)) {
    record.combo_sources.forEach((source) => {
      if (source && typeof source === "object" && !Array.isArray(source)) {
        applyEnvironmentToPromptObject((source as Record<string, any>).prompt, environment);
      }
    });
  }
}

function applyEnvironmentToText(raw: string, environment: string) {
  const trimmed = raw.trim();
  if (!trimmed) return `Environment: ${environment}.`;
  const nextEnvironment = `Environment: ${environment}.`;
  if (/Environment:\s*[^.]+\.?/i.test(trimmed)) {
    return trimmed.replace(/Environment:\s*[^.]+\.?/i, nextEnvironment);
  }
  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}${nextEnvironment}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function presetTextClause(preset: PromptPreset) {
  return `${preset.style}, ${preset.lighting}, ${preset.lens}.`;
}

// Morph combos are plain text, so a preset can only be appended. Strip any
// previously-applied preset clause first (matched against the known preset
// phrasings, not a fragile period regex) so toggling looks replaces instead of
// stacking — mirroring how environment behaves on text prompts.
function applyPresetToText(raw: string, preset: PromptPreset) {
  let text = raw;
  for (const known of presets) {
    text = text.replace(new RegExp(`\\s*\\.?\\s*${escapeRegExp(presetTextClause(known))}`, "g"), "");
  }
  text = text.trim();
  const clause = presetTextClause(preset);
  if (!text) return clause;
  const separator = /[.!?]$/.test(text) ? " " : ". ";
  return `${text}${separator}${clause}`;
}

export function applyPresetToPrompt(raw: string, preset: PromptPreset) {
  try {
    const parsed = JSON.parse(raw);
    applyPresetToPromptObject(parsed, preset);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return applyPresetToText(raw, preset);
  }
}

export function applyEnvironmentToPrompt(raw: string, environment: string) {
  const cleanEnvironment = environment.trim();
  if (!cleanEnvironment) return raw;
  try {
    const parsed = JSON.parse(raw);
    applyEnvironmentToPromptObject(parsed, cleanEnvironment);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return applyEnvironmentToText(raw, cleanEnvironment);
  }
}

export function downloadText(filename: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
