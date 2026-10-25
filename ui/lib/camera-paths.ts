import type { CameraPose as TermPose, CameraSelection } from "@/lib/camera-language";
import { geometryPose, lensReach, selectedFov } from "@/lib/preview-channels";

/**
 * Where the illustrative camera sits over a 0–1 shot, ported from FLUX Studio
 * Lite (`src/scene/camera-paths.ts`) and extended with rigs, lenses and
 * transitions. These are illustrations, not model controls.
 */
export type Point3 = [number, number, number];
export type RigPose = {
  position: Point3;
  target: Point3;
  roll: number;
  subjectRotation: number;
};
/** Which side of a cut to pose: the shot before it, after it, or as the transition plays. */
export type CutSide = "auto" | "before" | "after";

const rad = (degrees: number) => (degrees * Math.PI) / 180;
const HEAD: Point3 = [0, 1.57, 0];
const HEAD_RADIUS = 0.135;

/** The match cut's second location: a moon that rhymes with the subject's head, off to the side. */
export const MATCH_MOON = { center: [5.5, 3.3, -3] as Point3, radius: 0.42 };

function cutAngle(selection: CameraSelection, eased: number, side: CutSide) {
  const transition = selection.transitions;
  if (transition === "whip-pan") {
    if (side !== "auto") return side === "after" ? rad(120) : 0;
    return rad(120) * Math.min(1, Math.max(0, (eased - 0.45) / 0.1));
  }
  if (transition === "hard-cut" || transition === "match-cut" || transition === "dissolve") {
    // A dissolve renders both sides at once; as a single path it reads as the cut.
    const after = side === "after" || (side === "auto" && eased >= 0.5);
    return after ? rad(100) : 0;
  }
  return 0;
}

function rigPose(pose: TermPose, eased: number): RigPose | null {
  const head: Point3 = [0, 1.57, 0];
  switch (pose.rig) {
    case "pov":
      return { position: [0, 1.58, 0.16], target: [0.4 * (eased - 0.5), 1.45, 3], roll: 0, subjectRotation: 0 };
    case "body": {
      // The camera rides with the subject as both turn; the world swings past.
      const turn = rad(120) * eased;
      return {
        position: [Math.sin(turn) * 0.62, 1.34, Math.cos(turn) * 0.62],
        target: head,
        roll: 0,
        subjectRotation: turn
      };
    }
    case "drone":
      return { position: [0, 3.4 - 1.2 * eased, 6 - 3.6 * eased], target: [0, 0.9, 0], roll: 0, subjectRotation: 0 };
    case "steadicam":
      return { position: [-1.6 + 3.2 * eased, 1.35, 2.1], target: [0, 1.1, 0], roll: 0, subjectRotation: 0 };
    case "security":
      return { position: [2.3, 3.1, 2.3], target: [0, 0.8, 0], roll: 0, subjectRotation: 0 };
    default:
      // Handheld keeps the chosen framing and adds sway in cameraPose.
      return null;
  }
}

/**
 * The match cut's second shot: the first shot scaled about the subject's head
 * onto the moon, so the moon lands where the head was, at the same size.
 */
function matchCutPose(before: RigPose): RigPose {
  const scale = MATCH_MOON.radius / HEAD_RADIUS;
  const map = (point: Point3) => point.map((value, axis) => MATCH_MOON.center[axis] + (value - HEAD[axis]) * scale) as Point3;
  return { position: map(before.position), target: map(before.target), roll: before.roll, subjectRotation: 0 };
}

/** Combine framing, angle, composition, movement, lens, rig and transition. */
export function cameraPose(selection: CameraSelection, progress: number, side: CutSide = "auto"): RigPose {
  const t = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const eased = t * t * (3 - 2 * t);
  const pose = geometryPose(selection);
  const rigged = rigPose(pose, eased);
  if (rigged) return rigged;
  if (selection.transitions === "match-cut" && (side === "after" || (side === "auto" && eased >= 0.5))) {
    return matchCutPose(cameraPose(selection, progress, "before"));
  }
  const lens = selection.lenses ? lensReach(selectedFov(selection)) : 1;
  let distance = Math.max(0.4, (pose.distance ?? 2.7) * lens);
  let azimuth = rad(pose.azimuth ?? 0) + cutAngle(selection, eased, side);
  const target: Point3 = [0, pose.targetY ?? 0.9, 0];
  const elevation = rad(pose.elevation ?? 8);
  const amount = pose.amount ?? 0;
  if (pose.motion === "orbit" || pose.motion === "arc") azimuth += rad(amount) * eased;
  if (pose.motion === "dolly") distance *= 1 + amount * eased;
  const horizontal = Math.cos(elevation) * distance;
  const position: Point3 = [
    Math.sin(azimuth) * horizontal,
    Math.max(0.12, target[1] + Math.sin(elevation) * distance),
    Math.cos(azimuth) * horizontal
  ];
  if (pose.motion === "crane") position[1] += amount * eased;
  if (pose.motion === "truck") {
    position[0] += Math.cos(azimuth) * amount * (eased - 0.5);
    position[2] -= Math.sin(azimuth) * amount * (eased - 0.5);
  }
  if (pose.motion === "pan") {
    target[0] += Math.cos(azimuth) * amount * (eased - 0.5);
    target[2] -= Math.sin(azimuth) * amount * (eased - 0.5);
  }
  if (pose.motion === "tilt") target[1] += amount * (eased - 0.5);
  if (pose.rig === "handheld") {
    position[0] += Math.sin(t * 37) * 0.035;
    position[1] += Math.sin(t * 23 + 1) * 0.03;
  }
  return {
    position,
    target,
    roll: rad(pose.roll ?? 0) + (pose.rig === "handheld" ? Math.sin(t * 17) * 0.02 : 0),
    subjectRotation: pose.motion === "subject" ? rad(amount) * eased : 0
  };
}

export function cameraPath(selection: CameraSelection, segments = 48): Point3[] {
  const count = Number.isFinite(segments) ? Math.max(1, Math.min(128, Math.floor(segments))) : 48;
  return Array.from({ length: count + 1 }, (_, index) => cameraPose(selection, index / count).position);
}
