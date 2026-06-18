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
  "Use the attached reference role map as binding intent: @character controls identity, @style controls aesthetic, @environment controls world/setting, @pose controls posture and camera, and @loose references are secondary accents. When prompt text mentions a role token or @img token, obey that token-specific instruction over the default slot order.";

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

export function applyPresetToPrompt(raw: string, preset: (typeof presets)[number]) {
  try {
    const parsed = JSON.parse(raw);
    parsed.style = preset.style;
    parsed.lighting = preset.lighting;
    parsed.camera = {
      ...(parsed.camera || {}),
      lens: preset.lens,
      depth_of_field: "creamy cinematic bokeh with the main botanical anatomy sharply resolved"
    };
    parsed.mood = "strange sacred-plant atmosphere, tactile, elegant, filmic";
    return JSON.stringify(parsed, null, 2);
  } catch {
    return `${raw.trim()}. ${preset.style}, ${preset.lighting}, ${preset.lens}.`;
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
