import { describe, expect, it } from "vitest";
import {
  normalizeReferenceRole,
  referenceDropTargets,
  referencePreviewSrc,
  referenceRoleConfig,
  referenceRoleForIndex,
  referenceRoleOptions,
  referenceRoleToken,
  referenceRoleTokenPattern,
  referenceTargetToken,
  referenceToken
} from "@/lib/reference-roles";
import type { ReferenceImage, ReferenceRole } from "@/lib/types";

function reference(partial: Partial<ReferenceImage>): ReferenceImage {
  return { id: "r1", name: "ref", value: "", ...partial };
}

// Every prompt token the pattern can match, paired with the canonical role it
// must collapse to. This is the contract the cue prose, the drop targets, and
// the validators all rely on — if the pattern and the normalizer drift, the
// reference vocabulary silently breaks.
const TOKEN_TO_ROLE: Array<[string, ReferenceRole]> = [
  ["char", "character"],
  ["character", "character"],
  ["style", "style"],
  ["style1", "style"],
  ["style2", "style"],
  ["env", "environment"],
  ["environment", "environment"],
  ["pose", "pose"],
  ["img", "loose"],
  ["image", "loose"],
  ["extra", "loose"],
  ["loose", "loose"]
];

const VALID_ROLES = new Set<ReferenceRole>(referenceRoleOptions.map((option) => option.id));

describe("reference token <-> role contract", () => {
  it("normalizes every matchable token to a real role, independent of slot index", () => {
    for (const [token, role] of TOKEN_TO_ROLE) {
      // Two different indices: if this were falling through to the per-index
      // default instead of a real mapping, the two would disagree.
      expect(normalizeReferenceRole(token, 0)).toBe(role);
      expect(normalizeReferenceRole(token, 3)).toBe(role);
      expect(VALID_ROLES.has(normalizeReferenceRole(token))).toBe(true);
      expect(referenceRoleConfig(token).id).toBe(role);
    }
  });

  it("matches each token via the shared pattern and respects word boundaries", () => {
    for (const [token] of TOKEN_TO_ROLE) {
      const captured = Array.from(`@${token} rest`.matchAll(referenceRoleTokenPattern)).map((match) =>
        match[1].toLowerCase()
      );
      expect(captured).toContain(token);
    }
    // Boundary safety: a longer word that merely starts with a token must not match.
    expect(Array.from("@charisma".matchAll(referenceRoleTokenPattern))).toHaveLength(0);
    expect(Array.from("@stylesheet".matchAll(referenceRoleTokenPattern))).toHaveLength(0);
  });

  it("emits canonical short tokens for each role", () => {
    expect(referenceRoleToken("character")).toBe("@char");
    expect(referenceRoleToken("environment")).toBe("@env");
    expect(referenceRoleToken("loose")).toBe("@img");
    expect(referenceRoleToken("style")).toBe("@style");
    expect(referenceRoleToken("pose")).toBe("@pose");
  });

  it("numbers image slots as @img{index+1}", () => {
    expect(referenceToken(0)).toBe("@img1");
    expect(referenceToken(7)).toBe("@img8");
  });
});

describe("reference drop targets stay consistent with roles", () => {
  it("declares a token that normalizes back to the target's own role", () => {
    for (const target of referenceDropTargets) {
      const tokenWithoutPrefix = target.token.replace(/^@/, "");
      expect(normalizeReferenceRole(tokenWithoutPrefix)).toBe(target.role);
    }
  });

  it("round-trips a placed reference back to its target token via targetId", () => {
    for (const target of referenceDropTargets) {
      const token = referenceTargetToken({ targetId: target.id, role: target.role }, 0);
      expect(token).toBe(target.token);
    }
  });

  it("falls back to the role token when a reference has no targetId", () => {
    expect(referenceTargetToken({ role: "character" }, 0)).toBe("@char");
    expect(referenceTargetToken({ role: "style" }, 1)).toBe("@style");
  });

  it("covers exactly the five canonical roles across the drop targets", () => {
    const rolesInTargets = new Set(referenceDropTargets.map((target) => target.role));
    expect(rolesInTargets).toEqual(new Set<ReferenceRole>(["character", "style", "environment", "pose", "loose"]));
    // Style is the only role that fans out to two slots (style-1 / style-2).
    const styleTargets = referenceDropTargets.filter((target) => target.role === "style");
    expect(styleTargets).toHaveLength(2);
  });
});

describe("referencePreviewSrc resolves a thumbnail consistently", () => {
  it("returns data and absolute http(s) values directly", () => {
    expect(referencePreviewSrc(reference({ value: "data:image/png;base64,AAAA" }))).toBe("data:image/png;base64,AAAA");
    expect(referencePreviewSrc(reference({ value: "https://cdn.bfl.ai/x.png" }))).toBe("https://cdn.bfl.ai/x.png");
  });

  it("accepts app-relative output URLs (the case that left @char empty)", () => {
    // A reference sourced from a hydrated asset whose inline data URL was dropped
    // resolves to /api/outputs/:id/image — previously rejected, now rendered.
    const value = "/api/outputs/abc-123/image";
    expect(referencePreviewSrc(reference({ value }))).toBe(value);
  });

  it("falls back to the durable assetId when the value is missing or redacted", () => {
    expect(referencePreviewSrc(reference({ value: "", assetId: "asset-9" }))).toBe("/api/outputs/asset-9/image");
    expect(referencePreviewSrc(reference({ value: "[stored reference omitted]", assetId: "asset-9" }))).toBe(
      "/api/outputs/asset-9/image"
    );
  });

  it("returns empty only when there is nothing to show", () => {
    expect(referencePreviewSrc(reference({ value: "" }))).toBe("");
    expect(referencePreviewSrc(reference({ value: "[stored reference omitted]" }))).toBe("");
  });
});

describe("default role-by-index assignment", () => {
  it("starts at character and degrades to loose past the known slots", () => {
    expect(referenceRoleForIndex(0)).toBe("character");
    expect(VALID_ROLES.has(referenceRoleForIndex(5))).toBe(true);
    expect(referenceRoleForIndex(99)).toBe("loose");
  });
});
