import { describe, expect, it } from "vitest";
import { buildRunPlan } from "@/lib/run-plan";
import type { PromptRecord } from "@/lib/types";

const prompts: PromptRecord[] = [
  {
    id: "sample_01",
    prompt: "A clean cybernetic botanical specimen.",
    seed: 11
  }
];

describe("buildRunPlan", () => {
  it("carries reference image values through the dry-run request bodies", () => {
    const plan = buildRunPlan(prompts, {
      promptId: "sample_01",
      references: ["https://example.com/character.png", "data:image/png;base64,abc"],
      referenceCue: "Use @character for identity and @style for texture.",
      referenceWeight: 92
    });

    expect(plan.requests[0].body.references).toEqual([
      "https://example.com/character.png",
      "data:image/png;base64,abc"
    ]);
    expect(plan.requests[0].body.referenceWeight).toBe(92);
    expect(plan.requests[0].body.prompt).toContain("Reference roles: Use @character");
    expect(plan.nativeFluxMcpHandoff.groups[0].prompts[0].references).toEqual(plan.requests[0].body.references);
  });
});
