import type { TermSpec } from "@/lib/camera-term";
import { angles, composition, movements, pointOfView, shotSizes } from "@/lib/camera-terms-camera";
import { visualEffects, transitions } from "@/lib/camera-terms-effects";
import { animation, artDirection, focus, format, lenses, lighting, shutter } from "@/lib/camera-terms-look";

/**
 * Direction for FLUX 3 video: camera language ported from FLUX Studio Lite
 * (`shared/camera.ts`), grown to every section of BFL's public camera guide.
 * Each section links to the guide; labels, descriptions, clauses and examples
 * are this project's own wording. Pose hints only drive glyphs and the 3D
 * preview; only the clauses reach the prompt.
 */
export const CAMERA_GUIDE_URL = "https://docs.bfl.ai/guides/prompting_video_camera_terms";
/** Sections in the BFL guide; the panel exposes all of them. */
export const CAMERA_GUIDE_SECTION_COUNT = 14;
/** Longest clause a single term edit may carry. */
export const CAMERA_CLAUSE_MAX_LENGTH = 600;

const CLAUSE_SEPARATOR = "\n\n";

export type { CameraMotion, CameraPose, CameraRig, CameraFx, CameraLook } from "@/lib/camera-term";

/** All fourteen guide sections, in the guide's order, which is also the order clauses join the prompt. */
export const cameraSections = [
  shotSizes,
  angles,
  composition,
  movements,
  focus,
  lenses,
  shutter,
  lighting,
  transitions,
  pointOfView,
  format,
  visualEffects,
  artDirection,
  animation
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

export const emptyCameraSelection = Object.fromEntries(
  cameraSections.map((section) => [section.id, null])
) as CameraSelection;

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
