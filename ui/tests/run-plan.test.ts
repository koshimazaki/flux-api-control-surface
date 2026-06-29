import { describe, expect, it } from "vitest";
import { buildReferenceCue } from "@/lib/dashboard-generation";
import { buildRunPlan } from "@/lib/run-plan";
import type { PromptRecord, ReferenceImage } from "@/lib/types";

const prompts: PromptRecord[] = [
  {
    id: "sample_01",
    prompt: "A clean cybernetic botanical specimen.",
    seed: 11
  },
  {
    id: "sample_02",
    prompt: "A clean cybernetic botanical pair.",
    seed: 12
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

  it("puts the reference slider influence text into the prompt sent to FLUX", () => {
    const references: ReferenceImage[] = [
      {
        id: "character",
        name: "character.png",
        value: "https://example.com/character.png",
        role: "character",
        targetId: "character"
      }
    ];
    const lightCue = buildReferenceCue("Use @char for identity.", 20, references);
    const strongCue = buildReferenceCue("Use @char for identity.", 100, references);

    const lightPlan = buildRunPlan(prompts, {
      promptId: "sample_01",
      references: references.map((reference) => reference.value),
      referenceCue: lightCue,
      referenceWeight: 20
    });
    const strongPlan = buildRunPlan(prompts, {
      promptId: "sample_01",
      references: references.map((reference) => reference.value),
      referenceCue: strongCue,
      referenceWeight: 100
    });

    expect(lightPlan.requests[0].body.prompt).toContain("Reference roles: Attached reference map");
    expect(lightPlan.requests[0].body.prompt).toContain("Reference influence: 20/100");
    expect(lightPlan.requests[0].body.prompt).toContain("loose visual hint only");
    expect(strongPlan.requests[0].body.prompt).toContain("Reference influence: 100/100");
    expect(strongPlan.requests[0].body.prompt).toContain("dominant visual anchor");
    expect(strongPlan.requests[0].body.prompt).not.toEqual(lightPlan.requests[0].body.prompt);
    expect(strongPlan.nativeFluxMcpHandoff.groups[0].prompts[0].prompt).toBe(
      strongPlan.requests[0].body.prompt
    );
  });

  it("caps references by the selected model capability", () => {
    const references = Array.from({ length: 8 }, (_, index) => `https://example.com/ref-${index + 1}.png`);
    const plan = buildRunPlan(prompts, {
      promptId: "sample_01",
      model: "klein-9b",
      references
    });

    expect(plan.requests[0].body.references).toEqual(references.slice(0, 4));
    expect(plan.nativeFluxMcpHandoff.maxReferences).toBe(4);
  });

  it("lets the submitted seed override saved prompt seeds across batch modes", () => {
    const libraryPlan = buildRunPlan(prompts, {
      batchMode: "library",
      promptId: "sample_01",
      count: 2,
      seed: 7000
    });
    const permutationPlan = buildRunPlan(prompts, {
      batchMode: "permutations",
      promptIds: ["sample_01", "sample_02"],
      seed: 8000
    });

    expect(libraryPlan.requests.map((request) => request.body.seed)).toEqual([7000, 7001]);
    expect(permutationPlan.requests[0].body.seed).toBe(8000);
  });
});
