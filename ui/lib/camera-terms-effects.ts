import { term } from "@/lib/camera-term";

/**
 * Effects group: visual effects and transitions, written for this surface.
 * Section headings match BFL's camera guide so each can link to its section.
 */
export const visualEffects = {
  id: "vfx",
  label: "Visual effects",
  heading: "VFX and transformation",
  anchor: "vfx-and-transformation",
  color: "--camera-effects",
  glyph: "icon",
  terms: [
    term("particle-field", "Particle field", "Glowing motes drifting through the air.", "A field of glowing particles drifting through the air.", {
      fx: "particles"
    }),
    term("double-exposure", "Double exposure", "Two images layered in one frame.", "Double exposure layering the subject over a second scene.", {
      fx: "double"
    }),
    term("hologram", "Hologram", "A translucent, flickering projection.", "The subject rendered as a flickering blue hologram.", {
      fx: "hologram"
    }),
    term("glitch", "Digital glitch", "Pixel tears and signal errors.", "Digital glitch with tearing pixels and colour shifts.", {
      fx: "glitch"
    }),
    term("disintegrate", "Disintegration", "Break apart into fragments.", "The subject disintegrates into drifting fragments.", {
      fx: "disintegrate"
    }),
    term("smoke-reveal", "Smoke reveal", "Emerge from swirling smoke.", "The subject emerges from swirling smoke.", { fx: "smoke" }),
    term("crystal-growth", "Crystal growth", "Crystals spread across every surface.", "Crystals grow and spread across every surface.", {
      fx: "growth"
    }),
    term("liquid-morph", "Liquid form", "Melt into liquid and reform.", "The subject melts into liquid and reforms.", { fx: "liquid" })
  ]
} as const;

export const transitions = {
  id: "transitions",
  label: "Transitions",
  heading: "Shot transitions",
  anchor: "shot-transitions",
  color: "--camera-effects",
  glyph: "icon",
  terms: [
    term("hard-cut", "Hard cut", "An instant change of shot.", "Hard cut to a new angle halfway through."),
    term("match-cut", "Match cut", "Cut between matching shapes or motion.", "Match cut from the subject to a similar shape somewhere new."),
    term("whip-pan", "Whip pan", "A blur-fast pan into the next shot.", "Whip pan that blurs into the next shot."),
    term("dissolve", "Dissolve", "One image melts into the next.", "Slow dissolve into the next scene."),
    term("fade-black", "Fade to black", "The picture fades out.", "Ends with a fade to black."),
    term("morph-cut", "Morph", "The subject turns into the next shot.", "The subject morphs seamlessly into the next scene.")
  ]
} as const;
