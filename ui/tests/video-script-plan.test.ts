import { describe, expect, it } from "vitest";
import { estimateFlux3VideoUsd, flux3RequestBlocker } from "@/lib/flux3-video";
import {
  DEFAULT_VIDEO_SCRIPT_SETTINGS,
  FLUX3_VIDEO_RATES,
  estimateVideoUsd,
  mulberry32,
  planVideoScript,
  type VideoScriptPlan,
  type VideoScriptPlanInput,
  type VideoScriptPlanRow,
  type VideoScriptRateTable,
  type VideoScriptWarningCode
} from "@/lib/video-script-plan";

const PROMPT = { id: "vp_neon", text: "Drift through the neon corridor." };

function pool(id: string, count: number) {
  return { id, assetIds: Array.from({ length: count }, (_, index) => `${id}_${index + 1}`) };
}

function plan(input: VideoScriptPlanInput = {}): VideoScriptPlan {
  return planVideoScript({ prompts: [PROMPT], ...input });
}

function warningOf(result: VideoScriptPlan, code: VideoScriptWarningCode) {
  return result.warnings.find((warning) => warning.code === code);
}

function assetRows(result: VideoScriptPlan) {
  return result.rows.map((row) => row.assetIds);
}

function errorCodes(row: VideoScriptPlanRow) {
  return row.errors.map((error) => error.code);
}

describe("planVideoScript determinism", () => {
  it("returns byte-identical plans for identical input and seed", () => {
    const input: VideoScriptPlanInput = {
      prompts: [PROMPT],
      pools: [pool("a", 6), pool("b", 6), pool("c", 6)],
      generator: {
        workflow: "per-slot",
        strategy: "sample",
        sampleSize: 5,
        slots: [
          { kind: "pool", poolId: "a" },
          { kind: "pool", poolId: "b" },
          { kind: "pool", poolId: "c" }
        ]
      },
      seed: 7
    };

    expect(JSON.stringify(planVideoScript(input))).toBe(JSON.stringify(planVideoScript(input)));
  });

  it("samples different rows for a different seed", () => {
    const input: VideoScriptPlanInput = {
      prompts: [PROMPT],
      pools: [pool("a", 6), pool("b", 6), pool("c", 6)],
      generator: {
        workflow: "per-slot",
        strategy: "sample",
        sampleSize: 5,
        slots: [
          { kind: "pool", poolId: "a" },
          { kind: "pool", poolId: "b" },
          { kind: "pool", poolId: "c" }
        ]
      }
    };

    const first = assetRows(planVideoScript({ ...input, seed: 7 }));
    const second = assetRows(planVideoScript({ ...input, seed: 8 }));
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    expect(second).not.toEqual(first);
  });

  it("keeps the seed out of non-sampling expansion", () => {
    const input: VideoScriptPlanInput = {
      prompts: [PROMPT],
      pools: [pool("a", 3), pool("b", 2)],
      generator: {
        workflow: "per-slot",
        strategy: "cartesian",
        slots: [
          { kind: "pool", poolId: "a" },
          { kind: "pool", poolId: "b" }
        ]
      }
    };

    expect(assetRows(planVideoScript({ ...input, seed: 1 }))).toEqual(assetRows(planVideoScript({ ...input, seed: 99 })));
  });

  it("draws a repeatable mulberry32 stream inside [0, 1)", () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const other = mulberry32(43);
    const draws = [first(), first(), first(), first()];

    expect(draws).toEqual([second(), second(), second(), second()]);
    expect(draws.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(draws).not.toEqual([other(), other(), other(), other()]);
  });
});

describe("sequence-from-one-pool workflow", () => {
  it("expands unordered combinations of the pool", () => {
    const result = plan({
      pools: [pool("a", 4)],
      generator: { workflow: "sequence", poolId: "a", slotCount: 2, mode: "combination" }
    });

    expect(assetRows(result)).toEqual([
      ["a_1", "a_2"],
      ["a_1", "a_3"],
      ["a_1", "a_4"],
      ["a_2", "a_3"],
      ["a_2", "a_4"],
      ["a_3", "a_4"]
    ]);
    expect(result.preview.rawRowCount).toBe(6);
    expect(result.preview.uniqueRowCount).toBe(6);
  });

  it("expands ordered arrangements including reversed pairs", () => {
    const result = plan({
      pools: [pool("a", 3)],
      generator: { workflow: "sequence", poolId: "a", slotCount: 2, mode: "arrangement" }
    });

    expect(assetRows(result)).toEqual([
      ["a_1", "a_2"],
      ["a_1", "a_3"],
      ["a_2", "a_1"],
      ["a_2", "a_3"],
      ["a_3", "a_1"],
      ["a_3", "a_2"]
    ]);
  });

  it("expands one morph-chain rotation per starting image", () => {
    const result = plan({
      pools: [pool("a", 4)],
      generator: { workflow: "sequence", poolId: "a", slotCount: 4, mode: "rotation" }
    });

    expect(assetRows(result)).toEqual([
      ["a_1", "a_2", "a_3", "a_4"],
      ["a_2", "a_3", "a_4", "a_1"],
      ["a_3", "a_4", "a_1", "a_2"],
      ["a_4", "a_1", "a_2", "a_3"]
    ]);
  });

  it("warns instead of guessing when the pool is smaller than the row", () => {
    const result = plan({
      pools: [pool("a", 2)],
      generator: { workflow: "sequence", poolId: "a", slotCount: 4, mode: "combination" }
    });

    expect(result.rows).toHaveLength(0);
    expect(warningOf(result, "pool_too_small")).toMatchObject({ count: 2, limit: 4 });
  });

  it("warns when the sequence pool does not exist", () => {
    const result = plan({
      pools: [pool("a", 3)],
      generator: { workflow: "sequence", poolId: "missing", slotCount: 2, mode: "combination" }
    });

    expect(result.rows).toHaveLength(0);
    expect(warningOf(result, "missing_pool")).toBeDefined();
  });
});

describe("per-slot pools workflow", () => {
  it("multiplies varying slots and repeats pinned slots with the cartesian strategy", () => {
    const result = plan({
      pools: [pool("mid", 2), pool("end", 3)],
      generator: {
        workflow: "per-slot",
        strategy: "cartesian",
        slots: [
          { kind: "pinned", assetId: "hero" },
          { kind: "pool", poolId: "mid" },
          { kind: "pool", poolId: "end" }
        ]
      }
    });

    expect(assetRows(result)).toEqual([
      ["hero", "mid_1", "end_1"],
      ["hero", "mid_1", "end_2"],
      ["hero", "mid_1", "end_3"],
      ["hero", "mid_2", "end_1"],
      ["hero", "mid_2", "end_2"],
      ["hero", "mid_2", "end_3"]
    ]);
    expect(result.preview.rawRowCount).toBe(6);
  });

  it("aligns pools by index with the zip strategy", () => {
    const result = plan({
      pools: [pool("start", 3), pool("end", 3)],
      generator: {
        workflow: "per-slot",
        strategy: "zip",
        slots: [
          { kind: "pool", poolId: "start" },
          { kind: "pinned", assetId: "hero" },
          { kind: "pool", poolId: "end" }
        ]
      }
    });

    expect(assetRows(result)).toEqual([
      ["start_1", "hero", "end_1"],
      ["start_2", "hero", "end_2"],
      ["start_3", "hero", "end_3"]
    ]);
  });

  it("truncates and warns when zipped pools differ in length", () => {
    const result = plan({
      pools: [pool("start", 3), pool("end", 2)],
      generator: {
        workflow: "per-slot",
        strategy: "zip",
        slots: [
          { kind: "pool", poolId: "start" },
          { kind: "pool", poolId: "end" }
        ]
      }
    });

    expect(assetRows(result)).toEqual([
      ["start_1", "end_1"],
      ["start_2", "end_2"]
    ]);
    expect(warningOf(result, "zip_length_mismatch")).toMatchObject({ count: 1, limit: 2 });
  });

  it("draws a bounded distinct sample from the cartesian space", () => {
    const result = plan({
      pools: [pool("a", 5), pool("b", 5)],
      generator: {
        workflow: "per-slot",
        strategy: "sample",
        sampleSize: 6,
        slots: [
          { kind: "pool", poolId: "a" },
          { kind: "pool", poolId: "b" }
        ]
      },
      seed: 3
    });

    expect(result.rows).toHaveLength(6);
    expect(new Set(assetRows(result).map((row) => row.join("/"))).size).toBe(6);
    expect(result.preview.rawRowCount).toBe(6);
  });

  it("never samples more rows than the space holds", () => {
    const result = plan({
      pools: [pool("a", 2)],
      generator: {
        workflow: "per-slot",
        strategy: "sample",
        sampleSize: 25,
        slots: [{ kind: "pool", poolId: "a" }]
      },
      seed: 5,
      settings: { duration: 8 }
    });

    expect(result.rows).toHaveLength(2);
    expect(result.preview.rawRowCount).toBe(2);
  });

  it("skips unfilled manual slots and reports how many were skipped", () => {
    const result = plan({
      pools: [pool("end", 2)],
      generator: {
        workflow: "per-slot",
        strategy: "cartesian",
        slots: [
          { kind: "manual", assetId: "opening" },
          { kind: "manual" },
          { kind: "pool", poolId: "end" }
        ]
      }
    });

    expect(assetRows(result)).toEqual([
      ["opening", "end_1"],
      ["opening", "end_2"]
    ]);
    expect(warningOf(result, "empty_slot_skipped")).toMatchObject({ count: 1 });
  });
});

describe("normalization, dedupe, and the hard cap", () => {
  it("drops duplicate and blank source asset ids before expanding", () => {
    const result = plan({
      pools: [{ id: "a", assetIds: ["a_1", " a_1 ", "", "a_2"] }],
      generator: { workflow: "sequence", poolId: "a", slotCount: 2, mode: "combination" }
    });

    expect(assetRows(result)).toEqual([["a_1", "a_2"]]);
    expect(warningOf(result, "source_duplicates_dropped")).toMatchObject({ count: 2 });
  });

  it("removes identical ordered rows and reports the drop count", () => {
    const result = plan({
      manualRows: [
        { assetIds: ["a", "b"] },
        { assetIds: ["a", "b"] },
        { assetIds: ["b", "a"] }
      ]
    });

    expect(assetRows(result)).toEqual([
      ["a", "b"],
      ["b", "a"]
    ]);
    expect(result.preview.rawRowCount).toBe(3);
    expect(result.preview.uniqueRowCount).toBe(2);
    expect(warningOf(result, "row_dedupe_dropped")).toMatchObject({ count: 1 });
  });

  it("keeps a hand-authored row when a generated row would duplicate it", () => {
    const result = plan({
      pools: [pool("a", 2)],
      manualRows: [{ id: "keeper", assetIds: ["a_1", "a_2"] }],
      generator: { workflow: "sequence", poolId: "a", slotCount: 2, mode: "arrangement" }
    });

    expect(result.rows[0].id).toBe("keeper");
    expect(result.rows[0].origin).toBe("manual");
    expect(result.rows.map((row) => row.origin)).toEqual(["manual", "generated"]);
  });

  it("truncates at the hard cap and reports how many rows were dropped", () => {
    const result = plan({
      pools: [pool("a", 4), pool("b", 3)],
      generator: {
        workflow: "per-slot",
        strategy: "cartesian",
        slots: [
          { kind: "pool", poolId: "a" },
          { kind: "pool", poolId: "b" }
        ]
      },
      hardCap: 5
    });

    expect(result.rows).toHaveLength(5);
    expect(result.preview).toMatchObject({
      rawRowCount: 12,
      uniqueRowCount: 12,
      promptExpandedRowCount: 12,
      cappedRowCount: 5
    });
    expect(warningOf(result, "cap_truncated")).toMatchObject({ count: 7, limit: 5 });
  });

  it("reports the raw expansion count even when the expansion limit stops row building", () => {
    const result = plan({
      pools: [pool("a", 8)],
      generator: { workflow: "sequence", poolId: "a", slotCount: 4, mode: "arrangement" },
      expansionLimit: 10,
      hardCap: 10
    });

    expect(result.preview.rawRowCount).toBe(1680);
    expect(result.rows).toHaveLength(10);
    expect(warningOf(result, "expansion_limited")).toMatchObject({ count: 1670, limit: 10 });
  });
});

describe("prompt assignment modes", () => {
  const prompts = [
    { id: "p1", text: "Slow dolly in." },
    { id: "p2", text: "Hard whip pan." },
    { id: "p3", text: "Locked-off wide." }
  ];

  const rows = {
    manualRows: [{ assetIds: ["a", "b"] }, { assetIds: ["b", "c"] }, { assetIds: ["c", "d"] }, { assetIds: ["d", "e"] }]
  } satisfies VideoScriptPlanInput;

  it("applies one prompt to every row and reports ignored prompts", () => {
    const result = planVideoScript({ ...rows, prompts, promptMode: "single" });

    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((row) => row.promptIds)).toEqual([["p1"], ["p1"], ["p1"], ["p1"]]);
    expect(warningOf(result, "prompts_ignored")).toMatchObject({ count: 2 });
  });

  it("zips prompts to rows and truncates on a length mismatch", () => {
    const result = planVideoScript({ ...rows, prompts, promptMode: "zip" });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.compiledPrompt)).toEqual([
      "Slow dolly in.",
      "Hard whip pan.",
      "Locked-off wide."
    ]);
    expect(warningOf(result, "prompt_zip_length_mismatch")).toMatchObject({ count: 1, limit: 3 });
  });

  it("rotates prompts through the rows", () => {
    const result = planVideoScript({ ...rows, prompts: prompts.slice(0, 2), promptMode: "rotate" });

    expect(result.rows.map((row) => row.promptIds[0])).toEqual(["p1", "p2", "p1", "p2"]);
    expect(result.rows).toHaveLength(4);
  });

  it("concatenates selected prompts into one prompt", () => {
    const result = planVideoScript({ ...rows, prompts: prompts.slice(0, 2), promptMode: "combo" });

    expect(result.rows).toHaveLength(4);
    expect(result.rows[0].promptIds).toEqual(["p1", "p2"]);
    expect(result.rows[0].compiledPrompt).toBe("Slow dolly in.\n\nHard whip pan.");
    expect(result.rows.every((row) => row.compiledPrompt === result.rows[0].compiledPrompt)).toBe(true);
  });

  it("multiplies rows by prompts only when cartesian is explicitly selected", () => {
    const implied = planVideoScript({ ...rows, prompts, promptMode: "rotate" });
    const explicit = planVideoScript({ ...rows, prompts, promptMode: "cartesian" });

    expect(implied.rows).toHaveLength(4);
    expect(explicit.rows).toHaveLength(12);
    expect(explicit.preview.equation).toBe("4 image rows × 3 prompts = 12 jobs");
    expect(explicit.rows.slice(0, 3).map((row) => row.promptIds[0])).toEqual(["p1", "p2", "p3"]);
    expect(explicit.rows.slice(0, 3).map((row) => row.assetIds)).toEqual([
      ["a", "b"],
      ["a", "b"],
      ["a", "b"]
    ]);
    expect(new Set(explicit.rows.map((row) => row.id)).size).toBe(12);
  });

  it("flags every row when no prompt is assigned", () => {
    const result = planVideoScript({ ...rows, prompts: [] });

    expect(warningOf(result, "prompts_missing")).toBeDefined();
    expect(errorCodes(result.rows[0])).toContain("prompt_missing");
    expect(result.preview.estimatedTotalUsd).toBe(0);
  });
});

describe("FLUX.3 constraint validation", () => {
  it("accepts one to ten keyframes and rejects an eleventh", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `k_${index + 1}`);
    const result = plan({ manualRows: [{ assetIds: ten }, { assetIds: [...ten, "k_11"] }, { assetIds: [] }] });

    expect(result.rows[0].errors).toEqual([]);
    expect(errorCodes(result.rows[1])).toContain("keyframe_count");
    expect(errorCodes(result.rows[2])).toContain("keyframe_count");
    expect(result.preview.validRowCount).toBe(1);
    expect(result.preview.invalidRowCount).toBe(2);
    expect(warningOf(result, "invalid_rows")).toMatchObject({ count: 2 });
  });

  it("requires a fixed duration once three untimed keyframes are used", () => {
    const auto = plan({ manualRows: [{ assetIds: ["a", "b", "c"] }], settings: { duration: "auto" } });
    const pair = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { duration: "auto" } });
    const fixed = plan({ manualRows: [{ assetIds: ["a", "b", "c"] }], settings: { duration: 8 } });

    expect(errorCodes(auto.rows[0])).toContain("duration_required");
    expect(pair.rows[0].errors).toEqual([]);
    expect(fixed.rows[0].errors).toEqual([]);
  });

  it("keeps image-to-video durations inside the 5 to 20 second range", () => {
    const short = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { duration: 4 } });
    const long = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { duration: 21 } });
    const fractional = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { duration: 7.5 } });
    const legal = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { duration: 20 } });

    expect(errorCodes(short.rows[0])).toContain("duration_range");
    expect(errorCodes(long.rows[0])).toContain("duration_range");
    expect(errorCodes(fractional.rows[0])).toContain("duration_range");
    expect(legal.rows[0].errors).toEqual([]);
  });

  it("limits safety tolerance to 2 while conditioning media is attached", () => {
    const tooHigh = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { safetyTolerance: 3 } });
    const allowed = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { safetyTolerance: 2 } });

    expect(errorCodes(tooHigh.rows[0])).toContain("safety_tolerance");
    expect(allowed.rows[0].errors).toEqual([]);
  });

  it("rejects unsupported aspect ratios and resolutions", () => {
    const result = plan({
      manualRows: [{ assetIds: ["a", "b"] }],
      settings: { aspectRatio: "5:4" as never, resolution: "uhd" as never }
    });

    expect(errorCodes(result.rows[0])).toEqual(expect.arrayContaining(["aspect_ratio", "resolution"]));
  });

  it("passes the shared FLUX.3 request blocker for every row it marks valid", () => {
    const result = plan({
      pools: [pool("a", 4)],
      generator: { workflow: "sequence", poolId: "a", slotCount: 3, mode: "combination" },
      settings: { duration: 8 }
    });

    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row.errors).toEqual([]);
      expect(
        flux3RequestBlocker({
          mode: row.mode,
          prompt: row.compiledPrompt,
          keyframes: row.assetIds,
          duration: row.settings.duration,
          resolution: row.settings.resolution,
          aspectRatio: row.settings.aspectRatio,
          generateAudio: row.settings.generateAudio,
          safetyTolerance: row.settings.safetyTolerance,
          draft: row.settings.draft
        })
      ).toBeNull();
    }
  });
});

describe("timing template validation", () => {
  const timedRows = { manualRows: [{ assetIds: ["a", "b", "c"] }] } satisfies VideoScriptPlanInput;

  it("emits [seconds, image] pairs for a valid batch template", () => {
    const result = plan({ ...timedRows, timingMode: "timed", timingTemplate: [0, 3, 6], settings: { duration: 8 } });

    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].timedKeyframes).toEqual([
      [0, "a"],
      [3, "b"],
      [6, "c"]
    ]);
    expect(result.rows[0].slots.map((slot) => slot.seconds)).toEqual([0, 3, 6]);
  });

  it("leaves evenly spaced rows as plain image arrays", () => {
    const result = plan({ ...timedRows, timingTemplate: [0, 3, 6], settings: { duration: 8 } });

    expect(result.rows[0].timedKeyframes).toBeUndefined();
    expect(result.rows[0].slots.every((slot) => slot.seconds === undefined)).toBe(true);
  });

  it("rejects a template whose length does not match the keyframe count", () => {
    const result = plan({ ...timedRows, timingMode: "timed", timingTemplate: [0, 4], settings: { duration: 8 } });

    expect(errorCodes(result.rows[0])).toContain("timing_count");
    expect(result.rows[0].timedKeyframes).toBeUndefined();
  });

  it("rejects timestamps that do not strictly increase", () => {
    const result = plan({ ...timedRows, timingMode: "timed", timingTemplate: [0, 3, 3], settings: { duration: 8 } });

    expect(errorCodes(result.rows[0])).toContain("timing_order");
  });

  it("rejects negative timestamps and timestamps past the duration", () => {
    const negative = plan({ ...timedRows, timingMode: "timed", timingTemplate: [-1, 3, 6], settings: { duration: 8 } });
    const overrun = plan({ ...timedRows, timingMode: "timed", timingTemplate: [0, 3, 12], settings: { duration: 8 } });

    expect(errorCodes(negative.rows[0])).toContain("timing_range");
    expect(errorCodes(overrun.rows[0])).toContain("timing_range");
  });

  it("requires a template and a fixed duration for timed batches", () => {
    const missing = plan({ ...timedRows, timingMode: "timed", settings: { duration: 8 } });
    const auto = plan({ ...timedRows, timingMode: "timed", timingTemplate: [0, 3, 6], settings: { duration: "auto" } });

    expect(errorCodes(missing.rows[0])).toContain("timing_missing");
    expect(errorCodes(auto.rows[0])).toContain("duration_required");
  });

  it("lets one row override the batch timeline", () => {
    const result = plan({
      manualRows: [{ assetIds: ["a", "b"] }, { assetIds: ["c", "d"], timingOverride: [1, 5] }],
      timingMode: "timed",
      timingTemplate: [0, 4],
      settings: { duration: 8 }
    });

    expect(result.rows[0].timedKeyframes).toEqual([
      [0, "a"],
      [4, "b"]
    ]);
    expect(result.rows[1].timedKeyframes).toEqual([
      [1, "c"],
      [5, "d"]
    ]);
  });
});

describe("cost estimation", () => {
  it("prices drafts, hd, and fhd from the single rates constant", () => {
    expect(estimateVideoUsd({ mode: "i2v", duration: 8, draft: true, resolution: "hd" })).toBe(0.48);
    expect(estimateVideoUsd({ mode: "i2v", duration: 8, draft: false, resolution: "hd" })).toBe(1.36);
    expect(estimateVideoUsd({ mode: "i2v", duration: 10, draft: false, resolution: "fhd" })).toBe(2.9);
    expect(estimateVideoUsd({ mode: "t2v", duration: 5, draft: false, resolution: "hd" })).toBe(0.85);
    expect(estimateVideoUsd({ mode: "v2v", duration: 10, draft: true, resolution: "hd" })).toBe(1.2);
    expect(estimateVideoUsd({ mode: "v2v", duration: 10, draft: false, resolution: "fhd" })).toBe(5.4);
    expect(estimateVideoUsd({ mode: "i2v", duration: "auto", draft: true, resolution: "hd" })).toBeNull();
    expect(estimateVideoUsd({ mode: "draft_enhance", duration: 8, draft: false, resolution: "hd" })).toBeNull();
  });

  it("keeps the rates constant in step with the shared FLUX.3 estimator", () => {
    const cases = [
      { mode: "i2v", duration: 8, draft: true, resolution: "hd" },
      { mode: "i2v", duration: 8, draft: false, resolution: "hd" },
      { mode: "i2v", duration: 8, draft: false, resolution: "fhd" },
      { mode: "v2v", duration: 8, draft: true, resolution: "hd" },
      { mode: "v2v", duration: 8, draft: false, resolution: "hd" },
      { mode: "v2v", duration: 8, draft: false, resolution: "fhd" }
    ] as const;

    for (const input of cases) {
      const shared = estimateFlux3VideoUsd({ ...input, prompt: "x", startVideo: "clip" });
      expect(estimateVideoUsd(input)).toBeCloseTo(shared as number, 6);
    }
    expect(FLUX3_VIDEO_RATES.perSecond.i2v.draft).toBe(0.06);
    expect(FLUX3_VIDEO_RATES.capturedAt).toBe("2026-08-05");
  });

  it("totals only the rows that can actually be enqueued", () => {
    const result = plan({
      manualRows: [{ assetIds: ["a", "b"] }, { assetIds: ["c", "d"] }, { assetIds: [] }],
      settings: { duration: 8, draft: false, resolution: "hd" }
    });

    expect(result.rows.map((row) => row.estimatedUsd)).toEqual([1.36, 1.36, 1.36]);
    expect(result.preview.estimatedTotalUsd).toBe(2.72);
    expect(result.preview.invalidRowCount).toBe(1);
  });

  it("prices a per-row settings override independently", () => {
    const result = plan({
      manualRows: [{ assetIds: ["a", "b"] }, { assetIds: ["c", "d"], settingsOverride: { draft: false, duration: 10 } }],
      settings: { duration: 8, draft: true }
    });

    expect(result.rows[0].estimatedUsd).toBe(0.48);
    expect(result.rows[1].estimatedUsd).toBe(1.7);
    expect(result.rows[1].settings).toMatchObject({ duration: 10, draft: false, resolution: "hd" });
    expect(result.preview.estimatedTotalUsd).toBe(2.18);
  });

  it("accepts a replacement rate table for reconciliation", () => {
    const reconciled: VideoScriptRateTable = {
      ...FLUX3_VIDEO_RATES,
      source: "observed BFL cost",
      perSecond: { ...FLUX3_VIDEO_RATES.perSecond, i2v: { draft: 0.1, hd: 0.2, fhd: 0.3 } }
    };
    const result = plan({ manualRows: [{ assetIds: ["a", "b"] }], settings: { duration: 8 }, rates: reconciled });

    expect(result.rows[0].estimatedUsd).toBe(0.8);
    expect(result.rates.source).toBe("observed BFL cost");
  });
});

describe("plan preview and defaults", () => {
  it("reports the raw, unique, capped, and cost chain with the job equation", () => {
    const result = plan({
      pools: [pool("a", 4)],
      manualRows: [{ assetIds: ["a_1", "a_2"] }],
      generator: { workflow: "sequence", poolId: "a", slotCount: 2, mode: "combination" },
      hardCap: 4
    });

    expect(result.preview).toMatchObject({
      rawRowCount: 7,
      uniqueRowCount: 6,
      promptExpandedRowCount: 6,
      cappedRowCount: 4,
      promptCount: 1,
      validRowCount: 4,
      invalidRowCount: 0
    });
    expect(result.preview.estimatedTotalUsd).toBe(1.92);
    expect(result.preview.equation).toBe("6 image rows × 1 prompt = 6 jobs → 4 after limits");
  });

  it("uses the documented batch defaults and echoes the planner seed", () => {
    const result = plan({ manualRows: [{ assetIds: ["a", "b"] }], seed: 4242 });

    expect(result.settings).toEqual(DEFAULT_VIDEO_SCRIPT_SETTINGS);
    expect(result.settings).toMatchObject({
      duration: 8,
      resolution: "hd",
      aspectRatio: "16:9",
      draft: true,
      generateAudio: true,
      safetyTolerance: 2
    });
    expect(result.seed).toBe(4242);
    expect(result.promptMode).toBe("single");
    expect(result.timingMode).toBe("even");
  });

  it("warns rather than returning a silent empty plan", () => {
    const result = planVideoScript();

    expect(result.rows).toEqual([]);
    expect(warningOf(result, "no_rows")).toBeDefined();
  });
});
