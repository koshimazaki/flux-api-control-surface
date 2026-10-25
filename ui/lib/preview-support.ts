import { cameraClauses, cameraTerms, type CameraSelection, type CameraTerm, type CameraTermId } from "@/lib/camera-language";

/**
 * What the 3D preview can honestly show for each term, kept apart from what
 * the term does to the prompt. Every term has a record (the tests hold it to
 * that); completion is never inferred from a pose hint existing.
 *
 * - shot: shown in the shot preview as the term itself, at sketch fidelity.
 * - diagram: best read in the scene diagram (the rig and its path).
 * - approximation: a labelled stand-in that suggests the idea.
 * - prompt-only: no preview yet; the clause still goes to the model.
 */
export type PreviewLevel = "shot" | "diagram" | "approximation" | "prompt-only";
export type PreviewSupport = { level: PreviewLevel; note: string };

const shot = (note: string): PreviewSupport => ({ level: "shot", note });
const diagram = (note: string): PreviewSupport => ({ level: "diagram", note });
const approx = (note: string): PreviewSupport => ({ level: "approximation", note });
const promptOnly = (note: string): PreviewSupport => ({ level: "prompt-only", note });

const framing = shot("Framing in the shot.");
const angle = shot("Camera height and tilt in the shot.");
const path = diagram("The rig's path in the diagram; the shot moves with it.");
const lens = shot("Field of view; the camera moves to keep the framing, so depth stretches or flattens.");
const light = shot("Key light, fill and backdrop in the shot.");
const stand = approx("An illustrative stand-in on the mannequin.");

export const previewSupport: Record<CameraTermId, PreviewSupport> = {
  macro: framing,
  "extreme-close-up": framing,
  "close-up": framing,
  medium: framing,
  cowboy: framing,
  full: framing,
  wide: framing,
  establishing: shot("Framing in the shot; the stage is small, so the setting stays sparse."),
  "eye-level": angle,
  "low-angle": angle,
  "high-angle": angle,
  "birds-eye": angle,
  "worms-eye": angle,
  aerial: angle,
  dutch: shot("The rolled horizon in the shot."),
  profile: angle,
  "rule-of-thirds": shot("An off-axis frame puts the subject on the left third."),
  centered: shot("Centred subject between matching pillars."),
  "leading-lines": shot("Floor lines run to the subject."),
  "frame-within-frame": shot("A doorway between camera and subject frames the shot."),
  "negative-space": shot("A small subject low in an open frame."),
  "over-the-shoulder": shot("A foreground shoulder on the left, the subject on the right."),
  orbit: path,
  arc: path,
  "dolly-in": path,
  pan: path,
  tilt: path,
  crane: path,
  trucking: path,
  "lazy-susan": shot("The subject turns on its plinth; the camera holds."),
  "shallow-focus": shot("Depth of field from the shot's depth: the columns behind melt away."),
  "deep-focus": shot("No blur: the near marker, subject and columns all stay sharp."),
  "rack-focus": shot("Focus pulls from the near marker to the subject."),
  "soft-focus": approx("A diffusion glow over the whole frame."),
  "tilt-shift": approx("A horizontal band of focus; no tilted lens plane."),
  "split-diopter": approx("Each half of the frame focuses at its own distance."),
  "lens-14mm": lens,
  "lens-24mm": lens,
  "lens-35mm": lens,
  "lens-50mm": lens,
  "lens-85mm": lens,
  telephoto: shot("A long lens from far back; capped, so it frames a little tighter."),
  fisheye: approx("A barrel-distortion pass over a 100° view."),
  anamorphic: approx("Blue horizontal streaks from two practical lamps; no squeeze or oval bokeh."),
  "slow-motion": shot("Slower playback; the bouncing ball shows the pace."),
  timelapse: approx("Fast playback while the sun sweeps round."),
  hyperlapse: approx("Fast playback and a sweeping sun; add a movement for the travel."),
  "motion-blur": approx("Frame trails stand in for a long shutter."),
  "freeze-frame": shot("The shot plays to the middle and holds."),
  "speed-ramp": shot("Slow at first, then snaps to real time."),
  "golden-hour": light,
  "blue-hour": light,
  backlit: light,
  "low-key": light,
  "high-key": light,
  neon: shot("Pink key and cyan rim against a dark backdrop."),
  overcast: light,
  silhouette: shot("A dark subject against a bright backdrop."),
  "hard-cut": shot("An instant cut to a new angle halfway through."),
  "match-cut": approx("Cuts from the head to a moon placed where the head was."),
  "whip-pan": shot("A fast pan with horizontal blur into the next angle."),
  dissolve: shot("A crossfade between the two shots."),
  "fade-black": shot("The picture fades to black."),
  "morph-cut": approx("The subject folds into a sphere that morphs into a cube."),
  "first-person": approx("Eye height with forearms in view, looking out past a few landmarks."),
  "body-mount": shot("The camera stays locked to the subject as it turns."),
  handheld: shot("A light, breathing sway."),
  steadicam: shot("A smooth glide alongside the subject."),
  drone: shot("A descending flyover toward the subject."),
  "security-camera": approx("A high corner view with a mild fisheye."),
  letterbox: shot("2.39:1 bars over the 16:9 shot."),
  "film-16mm": approx("Fine grain, warmth and gate weave."),
  "super-8": approx("Coarse grain, flicker, 18 fps and a rounded gate."),
  vhs: approx("Scanlines, colour bleed and tracking wobble."),
  "split-screen": shot("Two views side by side."),
  "large-format": promptOnly("Applies to the prompt; its resolution and depth are beyond this sketch."),
  "particle-field": stand,
  "double-exposure": approx("A second view of the stage screened over the shot; not a separate scene."),
  hologram: stand,
  glitch: stand,
  disintegrate: stand,
  "smoke-reveal": stand,
  "crystal-growth": stand,
  "liquid-morph": stand,
  noir: shot("Black and white with hard contrast."),
  pastel: shot("A soft, lifted pastel grade."),
  "teal-orange": shot("Teal shadows and orange highlights."),
  "colour-accent": shot("Everything grey except the red ball."),
  brutalist: approx("A small concrete set behind the subject."),
  "retro-futurist": approx("A chrome arch, orb and warm plastic pod."),
  "pixel-art": approx("A coarse pixel grid and fewer colours."),
  claymation: approx("A clay material stepping at 12 fps."),
  anime: approx("Toon shading with ink outlines."),
  watercolour: approx("A soft wash with pooled edges on paper."),
  "paper-cutout": approx("Flat card tones with layer shadows."),
  "cgi-render": shot("The preview is already a 3D render.")
};

export type CoverageRow = { term: CameraTerm; support: PreviewSupport };
type Conflict = { note: string; hides: Array<CameraTermId | null> };

/**
 * Choices the preview cannot draw together, each matching a rule in the
 * scene, with the terms it leaves undrawn. The prompt still carries every clause.
 */
function conflicts(selection: CameraSelection): Conflict[] {
  const found: Conflict[] = [];
  const rig = selection.pov && selection.pov !== "handheld" ? (cameraTerms.find((item) => item.id === selection.pov)?.label ?? "The rig") : null;
  const cut = selection.transitions;
  if (rig && (selection["shot-sizes"] || selection.angles || selection.movements)) {
    found.push({
      note: `${rig} places the camera, so shot size, angle and movement are not drawn with it.`,
      hides: [selection["shot-sizes"], selection.angles, selection.movements]
    });
  }
  if (rig && selection.lenses) found.push({ note: `${rig} sets the distance, so the lens changes only the field of view.`, hides: [] });
  if (rig && (cut === "hard-cut" || cut === "match-cut" || cut === "whip-pan" || cut === "dissolve")) {
    found.push({ note: `${rig} keeps its own path, so the transition is not drawn.`, hides: [cut] });
  }
  if (selection.composition === "negative-space" && selection["shot-sizes"]) {
    found.push({ note: "Negative space sets its own distance, so the shot size is not drawn.", hides: [selection["shot-sizes"]] });
  }
  if (selection.format === "split-screen" && cut === "dissolve") {
    found.push({ note: "With split screen, the dissolve is not drawn.", hides: [cut] });
  }
  if (selection.vfx === "double-exposure" && (selection.format === "split-screen" || cut === "dissolve")) {
    found.push({ note: "The double exposure shows only when the split screen or dissolve is not using the second view.", hides: [] });
  }
  if (selection.vfx === "liquid-morph" && cut === "morph-cut") {
    found.push({ note: "Morph and liquid form both reshape the subject; the morph is drawn.", hides: [selection.vfx] });
  }
  return found;
}

/** Plain-words notes for choices the preview cannot draw together. */
export function combinationNotes(selection: CameraSelection): string[] {
  return conflicts(selection).map(({ note }) => note);
}

/** The chosen terms grouped by how far the preview shows them, in guide order; undrawn ones live in the notes. */
export function selectionCoverage(selection: CameraSelection) {
  const hidden = new Set(conflicts(selection).flatMap(({ hides }) => hides));
  const rows: CoverageRow[] = cameraClauses(selection)
    .filter(({ term }) => !hidden.has(term.id))
    .map(({ term }) => ({ term, support: previewSupport[term.id] }));
  return {
    shown: rows.filter(({ support }) => support.level === "shot" || support.level === "diagram"),
    approximate: rows.filter(({ support }) => support.level === "approximation"),
    promptOnly: rows.filter(({ support }) => support.level === "prompt-only")
  };
}
