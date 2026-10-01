import { term } from "@/lib/camera-term";

/**
 * Camera group: framing, angle, composition, movement and rig. Shot sizes,
 * angles and movements are Studio Lite's registry, unchanged; composition and
 * point-of-view are written for this surface. Section headings match BFL's
 * camera guide so each can link to its section.
 */
export const shotSizes = {
  id: "shot-sizes",
  label: "Shot sizes",
  heading: "Shot sizes and framing",
  anchor: "shot-sizes-and-framing",
  color: "--camera-shot",
  glyph: "frame",
  terms: [
    term("macro", "Macro", "Explore a tiny surface detail.", "Macro detail of the subject's surface.", {
      distance: 0.65,
      targetY: 1.3
    }),
    term(
      "extreme-close-up",
      "Extreme close-up",
      "Fill the frame with one detail.",
      "Extreme close-up on a single detail of the subject.",
      { distance: 0.95, targetY: 1.5 }
    ),
    term("close-up", "Close-up", "Concentrate on the upper part of the subject.", "Close-up of the subject.", {
      distance: 1.3,
      targetY: 1.4
    }),
    term("medium", "Medium shot", "Frame roughly from the waist upward.", "Medium shot of the subject.", {
      distance: 1.8,
      targetY: 1.2
    }),
    term("cowboy", "Cowboy shot", "Frame from mid-thigh upward.", "Cowboy shot of the subject.", {
      distance: 2.2,
      targetY: 1.1
    }),
    term("full", "Full shot", "Keep the entire subject in the frame.", "Full shot of the subject.", {
      distance: 2.7,
      targetY: 0.9
    }),
    term("wide", "Wide shot", "Give the subject room in its surroundings.", "Wide shot with space around the subject.", {
      distance: 3.8,
      targetY: 0.9
    }),
    term(
      "establishing",
      "Establishing shot",
      "Introduce the setting around the subject.",
      "Establishing shot of the subject within its surroundings.",
      { distance: 5.2, targetY: 0.9 }
    )
  ]
} as const;

export const angles = {
  id: "angles",
  label: "Angles",
  heading: "Camera angles",
  anchor: "camera-angles",
  color: "--camera-angle",
  glyph: "angle",
  terms: [
    term("eye-level", "Eye level", "Look straight toward the subject.", "Eye-level view of the subject.", { elevation: 0 }),
    term("low-angle", "Low angle", "Look upward from below.", "Low angle looking up at the subject.", { elevation: -18 }),
    term("high-angle", "High angle", "Look down from above.", "High angle looking down at the subject.", { elevation: 35 }),
    term("birds-eye", "Bird's eye", "Look almost straight down.", "Bird's eye view directly above the subject.", {
      elevation: 88
    }),
    term("worms-eye", "Worm's eye", "Look up from near the ground.", "Worm's eye view from ground level.", {
      elevation: -40
    }),
    term(
      "aerial",
      "Aerial",
      "Look down from a raised, oblique position.",
      "Aerial view above the subject and its surroundings.",
      { elevation: 55 }
    ),
    term("dutch", "Dutch angle", "Tilt the horizon within the frame.", "Dutch angle with a tilted horizon.", {
      elevation: 0,
      roll: 22
    }),
    term("profile", "Profile shot", "Look at the subject from the side.", "Profile shot from the side of the subject.", {
      elevation: 0,
      azimuth: 90
    })
  ]
} as const;

export const composition = {
  id: "composition",
  label: "Composition",
  heading: "Composition techniques",
  anchor: "composition-techniques",
  color: "--camera-shot",
  glyph: "icon",
  terms: [
    term(
      "rule-of-thirds",
      "Rule of thirds",
      "Set the subject on a third, not the centre.",
      "The subject sits on the left third of the frame, open space to the right.",
      { frame: [-1 / 3, 0] }
    ),
    term("centered", "Centred symmetry", "Balance the frame around the subject.", "Symmetrical composition with the subject dead centre."),
    term(
      "leading-lines",
      "Leading lines",
      "Let lines in the scene point at the subject.",
      "Lines in the scene lead the eye straight to the subject."
    ),
    term(
      "frame-within-frame",
      "Frame within a frame",
      "Look at the subject through a doorway or window.",
      "The subject seen through a doorway that frames the shot."
    ),
    term(
      "negative-space",
      "Negative space",
      "Leave most of the frame empty.",
      "A small subject surrounded by wide negative space.",
      { distance: 4.4, frame: [0.45, -0.32] }
    ),
    term(
      "over-the-shoulder",
      "Over the shoulder",
      "Look past a shoulder in the foreground.",
      "Over-the-shoulder framing with a soft shoulder in the foreground.",
      { frame: [0.3, 0.04] }
    )
  ]
} as const;

export const movements = {
  id: "movements",
  label: "Movements",
  heading: "Camera movements",
  anchor: "camera-movements",
  color: "--camera-movement",
  glyph: "motion",
  terms: [
    term("orbit", "Orbit", "Circle around the subject.", "Slow orbit around the subject.", { motion: "orbit", amount: 360 }),
    term("arc", "Arc shot", "Sweep through part of a circle.", "Arc shot around the subject.", { motion: "arc", amount: 65 }),
    term("dolly-in", "Dolly in", "Move the camera toward the subject.", "Dolly in toward the subject.", {
      motion: "dolly",
      amount: -0.35
    }),
    term("pan", "Pan", "Turn horizontally from a fixed position.", "Pan slowly across the subject.", {
      motion: "pan",
      amount: 0.8
    }),
    term("tilt", "Tilt", "Turn vertically from a fixed position.", "Tilt slowly upward along the subject.", {
      motion: "tilt",
      amount: 0.7
    }),
    term(
      "crane",
      "Crane / boom",
      "Lift the camera while keeping the subject in view.",
      "Crane / boom shot rising above the subject.",
      { motion: "crane", amount: 1.7 }
    ),
    term(
      "trucking",
      "Trucking",
      "Move the camera sideways across the scene.",
      "Trucking shot moving sideways past the subject.",
      { motion: "truck", amount: 1.8 }
    ),
    term(
      "lazy-susan",
      "Lazy Susan",
      "Rotate the subject while the camera stays still.",
      "Lazy Susan rotation of the subject on a turntable.",
      { motion: "subject", amount: 360 }
    )
  ]
} as const;

export const pointOfView = {
  id: "pov",
  label: "POV & rigs",
  heading: "POV and specialty rigs",
  anchor: "pov-and-specialty-rigs",
  color: "--camera-angle",
  glyph: "icon",
  terms: [
    term(
      "first-person",
      "First-person POV",
      "See through the character's own eyes.",
      "First-person point of view through the character's eyes.",
      { rig: "pov" }
    ),
    term(
      "body-mount",
      "Body mount",
      "Camera locked to the subject while the world swings behind.",
      "Body-mounted camera locked to the subject while the world moves behind them.",
      { rig: "body" }
    ),
    term("handheld", "Handheld", "Loose camera with a natural sway.", "Handheld camera with a slight, breathing sway.", {
      rig: "handheld"
    }),
    term("steadicam", "Steadicam", "Float smoothly alongside the subject.", "Smooth steadicam shot gliding alongside the subject.", {
      rig: "steadicam"
    }),
    term("drone", "Drone flyover", "Sweep in over the scene from the air.", "Drone shot flying low over the scene toward the subject.", {
      rig: "drone"
    }),
    term(
      "security-camera",
      "Security camera",
      "A fixed, high corner view.",
      "Static high-corner security-camera view with a slight fisheye.",
      { rig: "security" }
    )
  ]
} as const;
