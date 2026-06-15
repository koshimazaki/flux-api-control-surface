import { describe, expect, it } from "vitest";
import {
  clampBatchCount,
  clampReferenceWeight,
  composePrompt,
  countPairPermutations,
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
