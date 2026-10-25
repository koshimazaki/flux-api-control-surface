import { term } from "@/lib/camera-term";

/**
 * Look group: optics, time, light and style, written for this surface. Section
 * headings match BFL's camera guide so each can link to its section; the
 * clauses are this project's own wording.
 */
export const lenses = {
  id: "lenses",
  label: "Lenses",
  heading: "Lenses and optics",
  anchor: "lenses-and-optics",
  color: "--camera-optics",
  glyph: "icon",
  terms: [
    term("lens-14mm", "14mm ultra-wide", "A huge field of view with stretched edges.", "Shot on a 14mm ultra-wide lens with stretched edges.", {
      fov: 81
    }),
    term("lens-24mm", "24mm wide", "Wide, with the setting in view.", "Shot on a 24mm wide lens that keeps the setting in view.", {
      fov: 53
    }),
    term("lens-35mm", "35mm", "A natural storytelling perspective.", "Shot on a 35mm lens with a natural perspective.", { fov: 38 }),
    term("lens-50mm", "50mm", "Close to how the eye sees.", "Shot on a 50mm lens, close to how the eye sees.", { fov: 27 }),
    term("lens-85mm", "85mm portrait", "Flattering, with compressed depth.", "Shot on an 85mm portrait lens with compressed depth.", {
      fov: 16
    }),
    term("telephoto", "Telephoto", "Flatten the distance behind the subject.", "Long telephoto lens flattening the distance behind the subject.", {
      fov: 7
    }),
    term("fisheye", "Fisheye", "Strong barrel distortion.", "Fisheye lens with strong barrel distortion.", { fov: 100 }),
    term("anamorphic", "Anamorphic", "Oval bokeh and horizontal flares.", "Anamorphic lens with oval bokeh and horizontal flares.", {
      fov: 34
    })
  ]
} as const;

export const focus = {
  id: "focus",
  label: "Focus",
  heading: "Focus techniques",
  anchor: "focus-techniques",
  color: "--camera-optics",
  glyph: "icon",
  terms: [
    term("shallow-focus", "Shallow focus", "Sharp subject, soft background.", "Shallow depth of field, the background melting into soft blur."),
    term("deep-focus", "Deep focus", "Everything sharp front to back.", "Deep focus, foreground and background equally sharp."),
    term("rack-focus", "Rack focus", "Shift focus from one plane to another.", "Rack focus from the foreground to the subject."),
    term("soft-focus", "Soft focus", "Dreamy, diffused sharpness.", "Soft-focus diffusion with a gentle glow on the highlights."),
    term("tilt-shift", "Tilt-shift", "A thin band of focus, like a miniature.", "Tilt-shift focus that makes the scene look like a miniature."),
    term(
      "split-diopter",
      "Split diopter",
      "Two distances sharp at once.",
      "Split-diopter shot with a near object and the far subject both in focus."
    )
  ]
} as const;

export const shutter = {
  id: "shutter",
  label: "Shutter & time",
  heading: "Shutter and time",
  anchor: "shutter-and-time",
  color: "--camera-time",
  glyph: "icon",
  terms: [
    term("slow-motion", "Slow motion", "Stretch a moment out.", "Slow motion, the action stretched out.", { speed: 0.35 }),
    term("timelapse", "Time-lapse", "Hours pass in seconds.", "Time-lapse, clouds and light racing across the scene.", { speed: 3 }),
    term("hyperlapse", "Hyperlapse", "Time-lapse while the camera travels.", "Hyperlapse travelling through the scene as time speeds by.", {
      speed: 2.4
    }),
    term("motion-blur", "Motion blur", "A long shutter smears anything moving.", "Long shutter with streaking motion blur on anything that moves."),
    term("freeze-frame", "Freeze frame", "The action stops mid-moment.", "The action freezes mid-moment in a still frame.", { speed: 0 }),
    term("speed-ramp", "Speed ramp", "Slow down, then snap back to speed.", "Speed ramp from slow motion back to real time.", { speed: 0.6 })
  ]
} as const;

export const lighting = {
  id: "lighting",
  label: "Lighting",
  heading: "Lighting styles",
  anchor: "lighting-styles",
  color: "--camera-light",
  glyph: "icon",
  terms: [
    term("golden-hour", "Golden hour", "A low, warm sun.", "Golden-hour sunlight, low and warm.", {
      light: { azimuth: -60, elevation: 12, color: "#ffb45c", intensity: 3.2 }
    }),
    term("blue-hour", "Blue hour", "Cool twilight glow.", "Blue-hour twilight with cool, soft light.", {
      light: { azimuth: 20, elevation: 25, color: "#7aa8ff", intensity: 2.2 }
    }),
    term("backlit", "Backlit rim", "Light from behind outlines the subject.", "Backlit, a bright rim of light around the subject.", {
      light: { azimuth: 180, elevation: 20, color: "#ffffff", intensity: 3.4 }
    }),
    term("low-key", "Low key", "One hard light and deep shadows.", "Low-key lighting, one hard light and deep shadows.", {
      light: { azimuth: 90, elevation: 28, color: "#ffffff", intensity: 2.8 }
    }),
    term("high-key", "High key", "Bright and nearly shadowless.", "High-key lighting, bright and almost shadowless.", {
      light: { azimuth: 0, elevation: 62, color: "#ffffff", intensity: 3.6 }
    }),
    term("neon", "Neon", "Coloured light from signs.", "Lit by pink and cyan neon signs.", {
      light: { azimuth: -90, elevation: 10, color: "#ff4fd8", intensity: 3 }
    }),
    term("overcast", "Overcast", "Soft, even daylight.", "Soft overcast daylight with gentle shadows.", {
      light: { azimuth: 0, elevation: 80, color: "#dfe7ef", intensity: 2 }
    }),
    term("silhouette", "Silhouette", "Dark subject against a bright background.", "Silhouette against a bright sky.", {
      light: { azimuth: 180, elevation: 6, color: "#ffe2b0", intensity: 3.8 }
    })
  ]
} as const;

export const format = {
  id: "format",
  label: "Format",
  heading: "Aspect and format",
  anchor: "aspect-and-format",
  color: "--camera-format",
  glyph: "icon",
  terms: [
    term("letterbox", "Letterboxed", "Cinematic bars top and bottom.", "Letterboxed widescreen with black bars top and bottom."),
    term("film-16mm", "16mm film", "Grainy, warm film gauge.", "Shot on grainy 16mm film.", { look: "film" }),
    term("super-8", "Super 8", "Home-movie grain and gate weave.", "Super 8 home-movie look with soft grain and flicker.", { look: "film" }),
    term("vhs", "VHS tape", "Tape noise and bleeding colour.", "VHS camcorder footage with tape noise and colour bleed.", { look: "vhs" }),
    term("split-screen", "Split screen", "Two views side by side.", "Split screen showing two views side by side."),
    term("large-format", "Large format", "Crisp, towering large-format image.", "Large-format film with crisp detail and a sense of scale.")
  ]
} as const;

export const artDirection = {
  id: "art-direction",
  label: "Art direction",
  heading: "Art direction",
  anchor: "art-direction",
  color: "--camera-look",
  glyph: "icon",
  terms: [
    term("noir", "Film noir", "Black and white, hard shadows.", "Black-and-white film noir with hard shadows.", { look: "noir" }),
    term("pastel", "Pastel palette", "Soft candy colours.", "Soft pastel colour palette.", { look: "pastel" }),
    term("teal-orange", "Teal and orange", "Blockbuster colour grade.", "Teal-and-orange colour grade.", { look: "teal-orange" }),
    term("colour-accent", "Colour accent", "One colour kept, the rest grey.", "Monochrome frame with only red left in colour.", { look: "mono" }),
    term("brutalist", "Brutalist set", "Raw concrete and stark forms.", "Brutalist concrete set with stark geometric forms."),
    term("retro-futurist", "Retro-futurist", "Chrome and curves from an old idea of tomorrow.", "Retro-futurist design with chrome, curves and warm plastic.")
  ]
} as const;

export const animation = {
  id: "animation",
  label: "Animation",
  heading: "Animation and media",
  anchor: "animation-and-media",
  color: "--camera-look",
  glyph: "icon",
  terms: [
    term("pixel-art", "Pixel art", "Chunky low-resolution sprites.", "Retro pixel-art animation with chunky pixels.", { look: "pixel" }),
    term("claymation", "Claymation", "Handmade clay with stop-motion jitter.", "Stop-motion claymation with visible fingerprints.", { look: "clay" }),
    term("anime", "Anime", "Cel shading and bold outlines.", "Cel-shaded anime style with bold outlines.", { look: "toon" }),
    term("watercolour", "Watercolour", "Painted, bleeding washes.", "Watercolour animation with bleeding washes of colour.", { look: "pastel" }),
    term("paper-cutout", "Paper cut-out", "Layered paper puppets.", "Paper cut-out animation with layered card shapes.", { look: "toon" }),
    term("cgi-render", "3D render", "Polished 3D animation.", "Polished 3D animated render with soft global illumination.")
  ]
} as const;
