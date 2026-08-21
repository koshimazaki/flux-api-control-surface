import { describe, expect, it } from "vitest";
import { applyReferenceClauses, naturalClauseSentence, referenceClauses } from "@/lib/reference-clauses";
import type { ReferenceImage } from "@/lib/types";

function ref(partial: Partial<ReferenceImage>): ReferenceImage {
  return { id: "r", name: "ref", value: "data:image/png;base64,AAA", ...partial } as ReferenceImage;
}

describe("referenceClauses", () => {
  it("emits one clause per populated reference, in subject → pose → world → look order", () => {
    const clauses = referenceClauses([
      ref({ id: "a", role: "style", targetId: "style-1" }),
      ref({ id: "b", role: "character", targetId: "character" }),
      ref({ id: "c", role: "environment", targetId: "environment" })
    ]);
    expect(clauses.map((clause) => clause.role)).toEqual(["character", "environment", "style"]);
    expect(clauses.map((clause) => clause.token)).toEqual(["@char", "@env", "@style1"]);
  });

  it("ignores a reference with no image yet", () => {
    expect(referenceClauses([ref({ role: "character", value: "" })])).toEqual([]);
    expect(referenceClauses(undefined)).toEqual([]);
  });

  it("deduplicates by token", () => {
    const clauses = referenceClauses([
      ref({ id: "a", role: "character", targetId: "character" }),
      ref({ id: "b", role: "character", targetId: "character" })
    ]);
    expect(clauses).toHaveLength(1);
  });
});

describe("applyReferenceClauses — natural prompts", () => {
  it("adds a trailing sentence naming each role's token", () => {
    const result = applyReferenceClauses("a glass flower on a mountain", [
      ref({ role: "character", targetId: "character" }),
      ref({ role: "environment", targetId: "environment" })
    ]);
    expect(result).toContain("@char");
    expect(result).toContain("@env");
    expect(result.startsWith("a glass flower on a mountain")).toBe(true);
  });

  it("does not double a terminator", () => {
    const result = applyReferenceClauses("a glass flower.", [ref({ role: "character", targetId: "character" })]);
    expect(result).not.toContain("..");
  });

  it("returns the prompt untouched when there is nothing to add", () => {
    expect(applyReferenceClauses("a glass flower", [])).toBe("a glass flower");
  });
});

describe("applyReferenceClauses — JSON prompts", () => {
  const jsonPrompt = JSON.stringify({
    subjects: [{ description: "a cybernetic orchid", position: "centered" }],
    style: "cinematic macro",
    environment: "wet moss",
    composition: "clean silhouette"
  });

  it("lands each role in its own field rather than appending a block", () => {
    const parsed = JSON.parse(
      applyReferenceClauses(jsonPrompt, [
        ref({ role: "character", targetId: "character" }),
        ref({ role: "pose", targetId: "pose" }),
        ref({ role: "environment", targetId: "environment" }),
        ref({ role: "style", targetId: "style-1" })
      ])
    );
    expect(parsed.subjects[0].description).toContain("@char");
    expect(parsed.subjects[0].position).toContain("@pose");
    expect(parsed.environment).toContain("@env");
    expect(parsed.style).toContain("@style1");
  });

  it("appends to the existing value instead of replacing it", () => {
    const parsed = JSON.parse(applyReferenceClauses(jsonPrompt, [ref({ role: "environment", targetId: "environment" })]));
    expect(parsed.environment).toContain("wet moss");
    expect(parsed.environment).toContain("@env");
  });

  it("stays valid JSON", () => {
    const result = applyReferenceClauses(jsonPrompt, [ref({ role: "character", targetId: "character" })]);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("is idempotent — re-composing does not stack clauses", () => {
    const references = [ref({ role: "character", targetId: "character" })];
    const once = applyReferenceClauses(jsonPrompt, references);
    const twice = applyReferenceClauses(once, references);
    expect(twice).toBe(once);
    expect((once.match(/@char/g) || []).length).toBe(1);
  });

  it("leaves a hand-placed token alone", () => {
    const handPlaced = JSON.stringify({ subjects: [{ description: "an orchid shaped like @char" }] });
    expect(applyReferenceClauses(handPlaced, [ref({ role: "character", targetId: "character" })])).toBe(handPlaced);
  });

  it("creates a missing field rather than dropping the clause", () => {
    const sparse = JSON.stringify({ style: "cinematic" });
    const parsed = JSON.parse(applyReferenceClauses(sparse, [ref({ role: "environment", targetId: "environment" })]));
    expect(parsed.environment).toContain("@env");
    expect(parsed.style).toBe("cinematic");
  });

  it("routes a clause to reference_roles when its path is the wrong shape", () => {
    const hostile = JSON.stringify({ subjects: [{ description: 42 }] });
    const parsed = JSON.parse(applyReferenceClauses(hostile, [ref({ role: "character", targetId: "character" })]));
    expect(parsed.subjects[0].description).toBe(42);
    expect(JSON.stringify(parsed.reference_roles)).toContain("@char");
  });

  it("treats a JSON array prompt as natural text rather than mangling it", () => {
    const arrayPrompt = JSON.stringify(["a", "b"]);
    const result = applyReferenceClauses(arrayPrompt, [ref({ role: "character", targetId: "character" })]);
    expect(result.startsWith(arrayPrompt)).toBe(true);
    expect(result).toContain("@char");
  });
});

describe("naturalClauseSentence", () => {
  it("is empty for no clauses", () => {
    expect(naturalClauseSentence([])).toBe("");
  });
});
