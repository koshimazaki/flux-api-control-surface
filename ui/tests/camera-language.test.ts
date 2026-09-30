import { describe, expect, it } from "vitest";
import {
  CAMERA_CLAUSE_MAX_LENGTH,
  CAMERA_GUIDE_URL,
  applyCameraChoice,
  cameraChoice,
  cameraClauses,
  cameraLabel,
  cameraSections,
  cameraTerms,
  composeCameraClauses,
  defaultCameraDirection,
  emptyCameraSelection,
  normalizeCameraDirection,
  normalizeCameraEdits,
  normalizeCameraRecord,
  normalizeCameraSelection,
  stripCameraClauses,
  withCameraClauses,
  withClauseEdit,
  type CameraSelection
} from "@/lib/camera-language";

const FULL: CameraSelection = { ...emptyCameraSelection, "shot-sizes": "close-up", angles: "low-angle", movements: "orbit" };
const SCENE = "A chrome chair stands on a circular plinth in a quiet gallery.";
const FULL_CLAUSES = "Close-up of the subject.\n\nLow angle looking up at the subject.\n\nSlow orbit around the subject.";

describe("camera registry", () => {
  it("covers all fourteen guide sections in guide order, each linked to its section", () => {
    expect(cameraSections.map((section) => section.id)).toEqual([
      "shot-sizes",
      "angles",
      "composition",
      "movements",
      "focus",
      "lenses",
      "shutter",
      "lighting",
      "transitions",
      "pov",
      "format",
      "vfx",
      "art-direction",
      "animation"
    ]);
    for (const section of cameraSections) {
      expect(section.terms.length).toBeGreaterThanOrEqual(6);
      expect(section.anchor).toMatch(/^[a-z-]+$/);
    }
    expect(CAMERA_GUIDE_URL).toBe("https://docs.bfl.ai/guides/prompting_video_camera_terms");
    expect(new Set(cameraTerms.map((term) => term.id)).size).toBe(cameraTerms.length);
    expect(cameraTerms.every((term) => term.clause.endsWith(".") && term.description && term.label)).toBe(true);
  });

  it("keeps Studio Lite's three sections exactly as ported", () => {
    expect(cameraSections.slice(0, 2).concat(cameraSections[3]).map((section) => section.terms.length)).toEqual([8, 8, 8]);
    expect(cameraClauses(FULL).map(({ text }) => text)).toEqual([
      "Close-up of the subject.",
      "Low angle looking up at the subject.",
      "Slow orbit around the subject."
    ]);
  });


  it("starts with no camera direction, so existing prompts are unchanged", () => {
    expect(defaultCameraDirection.selection).toEqual(emptyCameraSelection);
    expect(cameraChoice(defaultCameraDirection)).toBeNull();
    expect(cameraLabel(emptyCameraSelection)).toBe("No camera direction");
  });
});

describe("composing camera clauses", () => {
  it("orders clauses shot size, angle, movement whatever the selection order", () => {
    const shuffled = { ...emptyCameraSelection, movements: "orbit", angles: "low-angle", "shot-sizes": "close-up" } as CameraSelection;
    expect(composeCameraClauses(shuffled)).toBe(FULL_CLAUSES);
    expect(cameraLabel(shuffled)).toBe("Close-up · Low angle · Orbit");
  });

  it("appends the clauses after the scene with a blank line, exactly once", () => {
    const once = withCameraClauses(`  ${SCENE}  `, FULL_CLAUSES);
    expect(once).toBe(`${SCENE}\n\n${FULL_CLAUSES}`);
    expect(withCameraClauses(once, FULL_CLAUSES)).toBe(once);
  });

  it("keeps a blank scene blank and leaves a prompt without clauses alone", () => {
    expect(withCameraClauses("   ", FULL_CLAUSES)).toBe("");
    expect(withCameraClauses(` ${SCENE}\n`, "")).toBe(SCENE);
  });

  it("strips only a trailing copy of the same clauses", () => {
    expect(stripCameraClauses(`${SCENE}\n\n${FULL_CLAUSES}`, FULL_CLAUSES)).toBe(SCENE);
    expect(stripCameraClauses(`${FULL_CLAUSES}\n\n${SCENE}`, FULL_CLAUSES)).toBe(`${FULL_CLAUSES}\n\n${SCENE}`);
  });
});

describe("per-term clause edits", () => {
  it("restores an edit after switching away and back, and keeps an emptied edit empty", () => {
    let edits = withClauseEdit({}, "orbit", "Fast orbit, left to right.");
    const away = { ...FULL, movements: "pan" } as CameraSelection;
    expect(composeCameraClauses(away, edits)).toContain("Pan slowly across the subject.");
    expect(composeCameraClauses(FULL, edits)).toContain("Fast orbit, left to right.");

    edits = withClauseEdit(edits, "close-up", "");
    expect(cameraClauses(FULL, edits)[0].text).toBe("");
    expect(composeCameraClauses(FULL, edits)).toBe("Low angle looking up at the subject.\n\nFast orbit, left to right.");
  });

  it("restores the default clause when an edit is cleared", () => {
    const edits = withClauseEdit(withClauseEdit({}, "orbit", "Fast orbit."), "orbit", undefined);
    expect(edits).toEqual({});
    expect(withClauseEdit({}, "pan", "x".repeat(CAMERA_CLAUSE_MAX_LENGTH + 20)).pan).toHaveLength(
      CAMERA_CLAUSE_MAX_LENGTH
    );
  });
});

describe("validating camera input", () => {
  it("keeps only term ids that belong to their own section", () => {
    expect(normalizeCameraSelection({ "shot-sizes": "orbit", angles: "dutch", movements: 7, lighting: "neon" })).toEqual({
      ...emptyCameraSelection,
      angles: "dutch",
      lighting: "neon"
    });
    expect(normalizeCameraSelection("close-up")).toEqual(emptyCameraSelection);
  });

  it("drops unknown or non-string edits and caps their length", () => {
    const edits = normalizeCameraEdits({ orbit: "o".repeat(900), bogus: "x", pan: 3 });
    expect(Object.keys(edits)).toEqual(["orbit"]);
    expect(edits.orbit).toHaveLength(CAMERA_CLAUSE_MAX_LENGTH);
  });

  it("reads stored panel state defensively", () => {
    expect(normalizeCameraDirection(null)).toEqual(defaultCameraDirection);
    expect(normalizeCameraDirection({ enabled: false, selection: FULL, edits: { orbit: "Fast." } })).toEqual({
      enabled: false,
      selection: FULL,
      edits: { orbit: "Fast." }
    });
  });
});

describe("request choice and saved record", () => {

  it("sends the exact clause for each chosen term, and nothing when switched off", () => {
    const direction = { enabled: true, selection: FULL, edits: { orbit: "Fast orbit.", pan: "Unused pan." } };
    expect(cameraChoice(direction)).toEqual({
      selection: FULL,
      edits: {
        "close-up": "Close-up of the subject.",
        "low-angle": "Low angle looking up at the subject.",
        orbit: "Fast orbit."
      }
    });
    expect(cameraChoice({ ...direction, enabled: false })).toBeNull();
  });

  it("appends clauses once for an agent that sends a scene plus a choice", () => {
    const applied = applyCameraChoice(SCENE, { selection: FULL });
    expect(applied.prompt).toBe(`${SCENE}\n\n${FULL_CLAUSES}`);
    expect(applied.camera).toMatchObject({ terms: ["Close-up", "Low angle", "Orbit"], scene: SCENE });
  });

  it("leaves the dashboard's already compiled prompt unchanged", () => {
    const compiled = `${SCENE}\n\n${FULL_CLAUSES}`;
    const applied = applyCameraChoice(compiled, cameraChoice({ enabled: true, selection: FULL, edits: {} }));
    expect(applied.prompt).toBe(compiled);
    expect(applied.camera?.scene).toBe(SCENE);
  });

  it("ignores an invalid choice and never turns camera direction alone into a prompt", () => {
    expect(applyCameraChoice(SCENE, { selection: { movements: "warp" } })).toEqual({ prompt: SCENE, camera: null });
    expect(applyCameraChoice("", { selection: FULL }).prompt).toBe("");
  });

  it("reads a saved record back with its labels and scene", () => {
    const saved = applyCameraChoice(SCENE, { selection: FULL }).camera;
    expect(normalizeCameraRecord(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(normalizeCameraRecord({ selection: {} })).toBeNull();
  });
});
