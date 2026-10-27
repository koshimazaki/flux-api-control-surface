import { describe, expect, it } from "vitest";
import { addReferenceAssignments } from "@/lib/reference-assignments";
import { buildReferenceCue } from "@/lib/dashboard-generation";
import { referenceClauses } from "@/lib/reference-clauses";
import { referencesFromStoredMeta, toStoredReferenceMeta } from "@/lib/reference-roles";
import type { ReferenceImage } from "@/lib/types";

const image: ReferenceImage = { id: "library-image", assetId: "image-1", value: "/api/outputs/image-1/image", name: "Shared image" };
const character = { ...image, id: "original", role: "character", targetId: "character" } satisfies ReferenceImage;

describe("independent reference assignments", () => {
  it.each([image, character, { ...character, assetId: undefined }])("copies a library or existing reference to multiple roles", (source) => {
    const pose = addReferenceAssignments([character], [source], 8, { role: "pose", id: "pose" });
    const style = addReferenceAssignments(pose.references, [source], 8, { role: "style", id: "style-1" });
    expect(style.references.map(ref => ref.targetId)).toEqual(["character", "pose", "style-1"]);
    expect(style.references[0]).toEqual(character);
    expect(style.references.map(ref => ref.value)).toEqual([image.value, image.value, image.value]);
    expect(new Set(style.references.map(ref => ref.id)).size).toBe(3);
    expect(pose.slots).toEqual([2]);
    expect(style.slots).toEqual([3]);
    const withoutPose = style.references.filter(ref => ref.id !== pose.references[1].id);
    expect(withoutPose.map(ref => ref.targetId)).toEqual(["character", "style-1"]);
  });

  it("reuses the same target on repeat drops, including a full reference set", () => {
    const first = addReferenceAssignments([character], [image], 2, { role: "pose", id: "pose" });
    const repeated = addReferenceAssignments(first.references, [image], 2, { role: "pose", id: "pose" });
    expect(repeated.references).toEqual(first.references);
    expect(repeated.slots).toEqual([2]);
    expect(repeated.limited).toBe(false);
    expect(addReferenceAssignments([character], [image], 8).references).toEqual([character]);
  });

  it("recognizes legacy assignments and still allows both style targets", () => {
    const legacy = [{ ...character, targetId: undefined }, { ...image, id: "old-style", role: "style" as const }];
    expect(addReferenceAssignments(legacy, [image], 8, { role: "character", id: "character" }).slots).toEqual([1]);
    expect(addReferenceAssignments(legacy, [image], 8, { role: "style", id: "style-1" }).slots).toEqual([2]);
    const second = addReferenceAssignments(legacy, [image], 8, { role: "style", id: "style-2" });
    expect(second.slots).toEqual([3]);
    expect(second.references[2].targetId).toBe("style-2");
  });

  it("keeps existing roles intact when the model's reference limit is reached", () => {
    const result = addReferenceAssignments([character], [image], 1, { role: "pose", id: "pose" });
    expect(result).toEqual({ references: [character], slots: [], limited: true });
    expect(addReferenceAssignments([], [image], 0).references).toEqual([]);
  });

  it("retains separate roles in submission cues and saved metadata for a shared source", () => {
    const refs = addReferenceAssignments([character], [image], 8, { role: "pose", id: "pose" }).references;
    expect(referenceClauses(refs).map(clause => clause.token)).toEqual(["@char", "@pose"]);
    const cue = buildReferenceCue("", 80, refs);
    expect(cue).toContain("@img1");
    expect(cue).toContain("@img2");
    const restored = referencesFromStoredMeta(toStoredReferenceMeta(refs));
    expect(restored.map(ref => [ref.assetId, ref.targetId])).toEqual([["image-1", "character"], ["image-1", "pose"]]);
  });
});
