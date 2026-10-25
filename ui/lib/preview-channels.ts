import { cameraSections, sectionTerms, type CameraPose, type CameraSelection, type CameraTerm } from "@/lib/camera-language";

/**
 * The preview reads a selection as independent channels, so choices in
 * different sections never overwrite each other: VHS, a colour grade and an
 * animation style each keep their own slot, where a single merged pose let the
 * last section win. Only the camera sections merge, because they all place
 * the same rig.
 */
export const GEOMETRY_SECTIONS = ["shot-sizes", "angles", "composition", "movements", "pov"] as const;

/** The 35mm default lens: the field of view the preview uses when no lens is chosen. */
export const DEFAULT_FOV = 38;

function chosen(selection: CameraSelection, sectionId: (typeof cameraSections)[number]["id"]): CameraTerm | undefined {
  const section = cameraSections.find((item) => item.id === sectionId);
  return section ? sectionTerms(section).find((item) => item.id === selection[section.id]) : undefined;
}

/** Framing, angle, composition, movement and rig hints merged in guide order; later sections win on overlap. */
export function geometryPose(selection: CameraSelection): CameraPose {
  return Object.assign({}, ...GEOMETRY_SECTIONS.map((id) => chosen(selection, id)?.pose ?? {}));
}

/** The diagram inset sits opposite the subject: on the left when a composition puts the subject right. */
export function insetOnLeft(selection: CameraSelection) {
  return (geometryPose(selection).frame?.[0] ?? 0) > 0.1;
}

/** The chosen lens's field of view, or the 35mm default. */
export function selectedFov(selection: CameraSelection) {
  return chosen(selection, "lenses")?.pose.fov ?? DEFAULT_FOV;
}

export type PreviewChannels = {
  geometry: CameraPose;
  fov: number;
  lens: CameraSelection["lenses"];
  focus: CameraSelection["focus"];
  shutter: CameraSelection["shutter"];
  /** Constant playback rate from shutter and time; ramps and freezes warp time instead. */
  rate: number;
  lighting: CameraSelection["lighting"];
  light: CameraPose["light"] | null;
  transition: CameraSelection["transitions"];
  rig: CameraSelection["pov"];
  format: CameraSelection["format"];
  grade: CameraSelection["art-direction"];
  media: CameraSelection["animation"];
  fx: CameraPose["fx"] | null;
  composition: CameraSelection["composition"];
};

export function previewChannels(selection: CameraSelection): PreviewChannels {
  const speed = chosen(selection, "shutter")?.pose.speed;
  const warped = selection.shutter === "speed-ramp" || selection.shutter === "freeze-frame";
  return {
    geometry: geometryPose(selection),
    fov: selectedFov(selection),
    lens: selection.lenses,
    focus: selection.focus,
    shutter: selection.shutter,
    rate: warped || !speed ? 1 : speed,
    lighting: selection.lighting,
    light: chosen(selection, "lighting")?.pose.light ?? null,
    transition: selection.transitions,
    rig: selection.pov,
    format: selection.format,
    grade: selection["art-direction"],
    media: selection.animation,
    fx: chosen(selection, "vfx")?.pose.fx ?? null,
    composition: selection.composition
  };
}

/**
 * How far the camera stands back for a lens, relative to the 35mm default, so
 * the chosen shot size keeps its framing and the lens shows as perspective:
 * a wide lens comes close and stretches depth, a long lens backs away and
 * flattens it. A fisheye stands like a 14mm, since its distortion pass
 * squeezes the edges back in.
 */
export function lensReach(fov: number) {
  const half = (Math.min(Math.max(fov, 1), 81) * Math.PI) / 360;
  const reach = Math.tan((DEFAULT_FOV * Math.PI) / 360) / Math.tan(half);
  return Math.min(6, Math.max(0.3, reach));
}

/**
 * Playback time for a 0–1 shot under the chosen shutter term: a speed ramp
 * runs slow then snaps to real time, a freeze frame holds the middle moment.
 * Constant speeds change the shot's duration instead (see the scene).
 */
export function warpProgress(shutter: PreviewChannels["shutter"], progress: number) {
  const t = Math.min(1, Math.max(0, progress));
  if (shutter === "speed-ramp") {
    // Slow for the first 60% of the clip at a third of the speed, then real time.
    const slowShare = 0.6;
    const slowRate = 1 / 3;
    const slowCovered = slowShare * slowRate;
    return t < slowShare ? (t * slowRate) / (slowCovered + (1 - slowShare)) : (slowCovered + (t - slowShare)) / (slowCovered + (1 - slowShare));
  }
  if (shutter === "freeze-frame") return Math.min(t, 0.5);
  return t;
}
