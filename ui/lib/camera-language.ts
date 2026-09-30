/**
 * Camera language for FLUX 3 text-to-video, ported from FLUX Studio Lite
 * (`shared/camera.ts`). Terms follow BFL's public camera guide, which each
 * section links to; labels, descriptions, clauses and examples are the studio's
 * own wording. Poses only drive the illustrative glyphs.
 */
export const CAMERA_GUIDE_URL = "https://docs.bfl.ai/guides/prompting_video_camera_terms";
/** Sections in the BFL guide; the panel exposes three of them. */
export const CAMERA_GUIDE_SECTION_COUNT = 14;
/** Longest clause a single term edit may carry. */
export const CAMERA_CLAUSE_MAX_LENGTH = 600;

const CLAUSE_SEPARATOR = "\n\n";

export type CameraMotion = "orbit" | "arc" | "dolly" | "pan" | "tilt" | "crane" | "truck" | "subject";

export type CameraPose = {
  distance?: number;
  targetY?: number;
  elevation?: number;
  azimuth?: number;
  roll?: number;
  motion?: CameraMotion;
  amount?: number;
};

type TermSpec = {
  id: string;
  label: string;
  description: string;
  clause: string;
  example: string;
  pose: CameraPose;
};

const term = <T extends string>(id: T, label: string, description: string, clause: string, pose: CameraPose) => ({
  id,
  label,
  description,
  clause,
  pose,
  example: `A chrome chair stands on a circular plinth in a quiet gallery. ${clause}`
});

export const cameraSections = [
  {
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
  },
  {
    id: "angles",
    label: "Angles",
    heading: "Camera angles",
    anchor: "camera-angles",
    color: "--camera-angle",
    glyph: "angle",
    terms: [
      term("eye-level", "Eye level", "Look straight toward the subject.", "Eye-level view of the subject.", {
        elevation: 0
      }),
      term("low-angle", "Low angle", "Look upward from below.", "Low angle looking up at the subject.", {
        elevation: -18
      }),
      term("high-angle", "High angle", "Look down from above.", "High angle looking down at the subject.", {
        elevation: 35
      }),
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
      term(
        "profile",
        "Profile shot",
        "Look at the subject from the side.",
        "Profile shot from the side of the subject.",
        { elevation: 0, azimuth: 90 }
      )
    ]
  },
  {
    id: "movements",
    label: "Movements",
    heading: "Camera movements",
    anchor: "camera-movements",
    color: "--camera-movement",
    glyph: "motion",
    terms: [
      term("orbit", "Orbit", "Circle around the subject.", "Slow orbit around the subject.", {
        motion: "orbit",
        amount: 360
      }),
      term("arc", "Arc shot", "Sweep through part of a circle.", "Arc shot around the subject.", {
        motion: "arc",
        amount: 65
      }),
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
  }
] as const;

export type CameraSection = (typeof cameraSections)[number];
export type CameraSectionId = CameraSection["id"];
export type CameraTermId = CameraSection["terms"][number]["id"];
export type CameraTerm = TermSpec & { id: CameraTermId };
export type CameraSelection = {
  [S in CameraSection as S["id"]]: S["terms"][number]["id"] | null;
};
/**
 * Clause edits keyed by term, so switching away from a term and back restores
 * its edit. An edit cleared to "" stays empty rather than reverting.
 */
export type CameraEdits = Partial<Record<CameraTermId, string>>;
export type CameraClause = { section: CameraSection; term: CameraTerm; text: string };

export const emptyCameraSelection: CameraSelection = { "shot-sizes": null, angles: null, movements: null };

export const cameraTerms: readonly CameraTerm[] = cameraSections.flatMap((section) => [...section.terms]);

export function sectionTerms(section: CameraSection): readonly CameraTerm[] {
  return section.terms;
}

/** The selected terms in guide order (shot size, angle, movement) with their clause text. */
export function cameraClauses(selection: CameraSelection, edits: CameraEdits = {}): CameraClause[] {
  return cameraSections.flatMap((section) => {
    const selected = sectionTerms(section).find((item) => item.id === selection[section.id]);
    return selected ? [{ section, term: selected, text: edits[selected.id] ?? selected.clause }] : [];
  });
}

/** The ordered clause string for a selection: trimmed, blank clauses dropped. */
export function composeCameraClauses(selection: CameraSelection, edits: CameraEdits = {}) {
  return cameraClauses(selection, edits)
    .map(({ text }) => text.trim())
    .filter(Boolean)
    .join(CLAUSE_SEPARATOR);
}

/**
 * The scene followed by the camera clauses, as Studio Lite composes a prompt.
 * Idempotent: a prompt that already ends with these clauses (a reloaded render
 * or a saved library card) comes back unchanged. A blank scene stays blank, so
 * camera direction on its own never passes the prompt blocker.
 */
export function withCameraClauses(prompt: string, clauses: string) {
  const scene = prompt.trim();
  const tail = clauses.trim();
  if (!scene || !tail || scene.endsWith(`${CLAUSE_SEPARATOR}${tail}`)) return scene;
  return `${scene}${CLAUSE_SEPARATOR}${tail}`;
}

/** The scene part of a prompt that may already end with these clauses. */
export function stripCameraClauses(prompt: string, clauses: string) {
  const text = prompt.trim();
  const suffix = `${CLAUSE_SEPARATOR}${clauses.trim()}`;
  return clauses.trim() && text.endsWith(suffix) ? text.slice(0, -suffix.length).trim() : text;
}

export function hasCameraSelection(selection: CameraSelection) {
  return cameraSections.some((section) => selection[section.id] !== null);
}

export function cameraTermLabels(selection: CameraSelection) {
  return cameraClauses(selection).map(({ term }) => term.label);
}

export function cameraLabel(selection: CameraSelection) {
  return cameraTermLabels(selection).join(" · ") || "No camera direction";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Keeps only term ids that belong to their own section; anything else reads as None. */
export function normalizeCameraSelection(value: unknown): CameraSelection {
  const record = asRecord(value);
  const selection: Record<string, CameraTermId | null> = {};
  for (const section of cameraSections) {
    const match = sectionTerms(section).find((item) => item.id === record[section.id]);
    selection[section.id] = match ? match.id : null;
  }
  return selection as CameraSelection;
}

/** Keeps string edits for known terms, capped at the clause length limit. */
export function normalizeCameraEdits(value: unknown): CameraEdits {
  const record = asRecord(value);
  const edits: CameraEdits = {};
  for (const item of cameraTerms) {
    const text = record[item.id];
    if (typeof text === "string") edits[item.id] = text.slice(0, CAMERA_CLAUSE_MAX_LENGTH);
  }
  return edits;
}

/** Sets one term's clause edit; undefined restores the default clause. */
export function withClauseEdit(edits: CameraEdits, id: CameraTermId, text: string | undefined): CameraEdits {
  const next = { ...edits };
  if (text === undefined) delete next[id];
  else next[id] = text.slice(0, CAMERA_CLAUSE_MAX_LENGTH);
  return next;
}

/** The panel state: chosen terms, per-term edits, and whether they reach the prompt. */
export type CameraDirection = { enabled: boolean; selection: CameraSelection; edits: CameraEdits };

export const defaultCameraDirection: CameraDirection = { enabled: true, selection: emptyCameraSelection, edits: {} };

export function normalizeCameraDirection(value: unknown): CameraDirection {
  const record = asRecord(value);
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    selection: normalizeCameraSelection(record.selection),
    edits: normalizeCameraEdits(record.edits)
  };
}

/** What a render request carries: the chosen terms and the exact clause sent for each. */
export type CameraChoice = { selection: CameraSelection; edits: CameraEdits };
/** What a saved render records: the choice, its term labels, and the scene before the clauses. */
export type CameraRecord = CameraChoice & { terms: string[]; scene: string };

function exactEdits(selection: CameraSelection, edits: CameraEdits): CameraEdits {
  return Object.fromEntries(cameraClauses(selection, edits).map(({ term, text }) => [term.id, text]));
}

/** The request choice for the panel state, or null when it adds nothing. */
export function cameraChoice(direction: CameraDirection): CameraChoice | null {
  if (!direction.enabled || !hasCameraSelection(direction.selection)) return null;
  return { selection: direction.selection, edits: exactEdits(direction.selection, direction.edits) };
}

/** Validates an untrusted choice (request body, saved metadata); null when nothing is selected. */
export function normalizeCameraChoice(value: unknown): CameraChoice | null {
  const record = asRecord(value);
  const selection = normalizeCameraSelection(record.selection);
  if (!hasCameraSelection(selection)) return null;
  return { selection, edits: exactEdits(selection, normalizeCameraEdits(record.edits)) };
}

/** Reads a saved render's camera record; null when absent or invalid. */
export function normalizeCameraRecord(value: unknown): CameraRecord | null {
  const choice = normalizeCameraChoice(value);
  if (!choice) return null;
  const scene = asRecord(value).scene;
  return { ...choice, terms: cameraTermLabels(choice.selection), scene: typeof scene === "string" ? scene : "" };
}

/**
 * Server side of the panel: appends the chosen clauses to the prompt exactly
 * once and returns the record saved with the render. The dashboard already
 * sends the compiled prompt, so this only changes prompts from agents that send
 * a scene plus a camera choice.
 */
export function applyCameraChoice(prompt: string, value: unknown): { prompt: string; camera: CameraRecord | null } {
  const choice = normalizeCameraChoice(value);
  if (!choice) return { prompt, camera: null };
  const clauses = composeCameraClauses(choice.selection, choice.edits);
  const scene = stripCameraClauses(prompt, clauses);
  return {
    prompt: withCameraClauses(scene, clauses),
    camera: { ...choice, terms: cameraTermLabels(choice.selection), scene }
  };
}
