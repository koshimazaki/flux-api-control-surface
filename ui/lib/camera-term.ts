/**
 * Shared shape of a direction term: its label, description, the clause it adds
 * to the prompt, and hints for the illustrative 3D preview. The hints never
 * reach the API; only the clause does.
 */
export type CameraMotion = "orbit" | "arc" | "dolly" | "pan" | "tilt" | "crane" | "truck" | "subject";

/** Where the preview camera rides for point-of-view and specialty rigs. */
export type CameraRig = "pov" | "body" | "drone" | "handheld" | "steadicam" | "security";
/** An effect drawn on or around the preview subject. */
export type CameraFx = "particles" | "double" | "hologram" | "glitch" | "disintegrate" | "smoke" | "growth" | "liquid";
/** A look applied to the whole preview image. */
export type CameraLook = "pixel" | "noir" | "pastel" | "teal-orange" | "mono" | "toon" | "clay" | "film" | "vhs";

export type CameraPose = {
  distance?: number;
  targetY?: number;
  elevation?: number;
  azimuth?: number;
  roll?: number;
  motion?: CameraMotion;
  amount?: number;
  /** Lens: vertical field of view in degrees, drawn as the camera's frustum. */
  fov?: number;
  /** Lighting: key light direction (degrees) and colour. */
  light?: { azimuth: number; elevation: number; color: string; intensity: number };
  rig?: CameraRig;
  fx?: CameraFx;
  look?: CameraLook;
  /** Time terms: preview playback speed, 1 is normal. */
  speed?: number;
};

export type TermSpec = {
  id: string;
  label: string;
  description: string;
  clause: string;
  example: string;
  pose: CameraPose;
};

export const term = <T extends string>(id: T, label: string, description: string, clause: string, pose: CameraPose = {}) => ({
  id,
  label,
  description,
  clause,
  pose,
  example: `A chrome chair stands on a circular plinth in a quiet gallery. ${clause}`
});
