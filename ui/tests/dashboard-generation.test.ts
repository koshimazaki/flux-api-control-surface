import { describe, expect, it } from "vitest";
import {
  buildReferenceCue,
  clampBatchCount,
  clampReferenceWeight,
  composePrompt,
  countPairPermutations,
  missingPromptImageTokens,
  missingPromptReferenceRoleTokens,
  promptImageTokenNumbers,
  promptReferenceRoleTokens,
  parseSeed
} from "@/lib/dashboard-generation";
import type { ReferenceImage } from "@/lib/types";

describe("countPairPermutations", () => {
  it("is 0 below two sources and n*(n-1)/2 otherwise", () => {
    expect(countPairPermutations(0)).toBe(0);
    expect(countPairPermutations(1)).toBe(0);
    expect(countPairPermutations(2)).toBe(1);
    expect(countPairPermutations(3)).toBe(3);
    expect(countPairPermutations(4)).toBe(6);
  });
});

describe("clampBatchCount", () => {
  it("clamps to [1, 300] and floors", () => {
    expect(clampBatchCount(0)).toBe(1);
    expect(clampBatchCount(2.9)).toBe(2);
    expect(clampBatchCount(500)).toBe(300);
    expect(clampBatchCount(Number.NaN)).toBe(1);
  });
});

describe("parseSeed", () => {
  it("returns null for blank/invalid, number otherwise", () => {
    expect(parseSeed("")).toBeNull();
    expect(parseSeed("   ")).toBeNull();
    expect(parseSeed("abc")).toBeNull();
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed("1.5")).toBe(1.5);
  });
});

describe("clampReferenceWeight", () => {
  it("clamps to [0, 100] and defaults NaN to 80", () => {
    expect(clampReferenceWeight(-5)).toBe(0);
    expect(clampReferenceWeight(150)).toBe(100);
    expect(clampReferenceWeight(80)).toBe(80);
    expect(clampReferenceWeight(Number.NaN)).toBe(80);
  });
});

describe("composePrompt", () => {
  const ref = (value: string): ReferenceImage => ({ id: "r", name: "r", value });

  it("returns the base prompt when no reference has a value", () => {
    expect(composePrompt("a flower", [], "cue")).toBe("a flower");
    expect(composePrompt("a flower", [ref("")], "cue")).toBe("a flower");
  });

  it("appends the reference-roles cue when a reference has a value", () => {
    const out = composePrompt("a flower", [ref("https://x/y.png")], "use img1 for shape");
    expect(out).toContain("a flower");
    expect(out).toContain("Reference roles: use img1 for shape");
  });
});

describe("prompt image tokens", () => {
  it("extracts unique @img token numbers in order", () => {
    expect(promptImageTokenNumbers("Use @img2, @IMG1 and @img2 again")).toEqual([1, 2]);
  });

  it("reports tokens that do not have a populated reference slot", () => {
    const references: ReferenceImage[] = [
      { id: "one", name: "one", value: "https://x/one.png" },
      { id: "two", name: "two", value: "" }
    ];
    expect(missingPromptImageTokens("Use @img1, @img2, and @img3", references)).toEqual([2, 3]);
  });
});

describe("prompt reference role tokens", () => {
  it("extracts semantic role tokens in order", () => {
    expect(promptReferenceRoleTokens("As on @character, with @POSE and @character again")).toEqual([
      "character",
      "pose"
    ]);
  });

  it("reports semantic role tokens without a populated matching role", () => {
    const references: ReferenceImage[] = [
      { id: "one", name: "one", value: "https://x/one.png", role: "character" },
      { id: "two", name: "two", value: "", role: "pose" }
    ];
    expect(missingPromptReferenceRoleTokens("As on @character, posture from @pose, style from @style", references)).toEqual([
      "pose",
      "style"
    ]);
  });
});

describe("buildReferenceCue", () => {
  it("maps @img tokens to FLUX input fields and includes reference weight", () => {
    const cue = buildReferenceCue("Use the first image for the creature.", 100, [
      { id: "one", name: "creature.png", value: "https://x/one.png", role: "character" },
      { id: "two", name: "portal.png", value: "https://x/two.png", role: "environment" }
    ]);
    expect(cue).toContain("@character / @img1 / image 1: creature.png. Role: Character. Sent to FLUX as input_image.");
    expect(cue).toContain("@environment / @img2 / image 2: portal.png. Role: Environment. Sent to FLUX as input_image_2.");
    expect(cue).toContain("Use this image for the character identity");
    expect(cue).toContain("Use this image for environment");
    expect(cue).toContain("Use the first image for the creature.");
    expect(cue).toContain("Reference influence: 100/100");
  });
});
