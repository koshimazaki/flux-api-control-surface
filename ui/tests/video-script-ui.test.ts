import { describe, expect, it } from "vitest";
import type { AssetCollection, AssetRecord, PromptRecord } from "@/lib/types";
import { planVideoScript } from "@/lib/video-script-plan";
import { videoScriptPoolAssetIds } from "@/lib/video-script/sources";
import {
  planVideoScriptBatch,
  planVideoScriptGenerator,
  videoScriptGenerator,
  videoScriptPrompts
} from "@/lib/video-script/plan-input";
import {
  addRow,
  bindColumn,
  clearEditedRows,
  duplicateRow,
  moveRow,
  moveRowSlot,
  regenerateRows,
  resetRowEdits,
  rowFromAssetIds,
  setRowSlot,
  setRowTiming,
  setSlotCount
} from "@/lib/video-script/rows";
import {
  DEFAULT_VIDEO_SCRIPT_SLOTS,
  MAX_VIDEO_SCRIPT_SLOTS,
  defaultVideoScriptEditorState,
  evenTimingTemplate,
  type VideoScriptEditorState
} from "@/lib/video-script/types";

const PROMPT: PromptRecord = { id: "vp_neon", prompt: "Drift through the neon corridor." };

function poolState(assetIds: string[], overrides: Partial<VideoScriptEditorState> = {}): VideoScriptEditorState {
  return {
    ...defaultVideoScriptEditorState(),
    pools: [{ id: "pool_a", label: "Corridor", collectionId: "col_a", assetIds }],
    sequencePoolId: "pool_a",
    promptIds: [PROMPT.id],
    ...overrides
  };
}

function seededRows(state: VideoScriptEditorState, assetRows: string[][]) {
  return { ...state, rows: assetRows.map((assetIds) => rowFromAssetIds(assetIds, state.slotCount)) };
}

describe("video script editor defaults", () => {
  it("starts with the PRD batch defaults and four visible keyframe slots", () => {
    const state = defaultVideoScriptEditorState();
    expect(state.slotCount).toBe(DEFAULT_VIDEO_SCRIPT_SLOTS);
    expect(state.columns).toHaveLength(DEFAULT_VIDEO_SCRIPT_SLOTS);
    expect(state.settings).toMatchObject({
      duration: 8,
      resolution: "hd",
      aspectRatio: "16:9",
      draft: true,
      generateAudio: true,
      safetyTolerance: 2
    });
    expect(state.timingMode).toBe("even");
    expect(state.promptMode).toBe("single");
  });

  it("expands rows and columns up to the API maximum of ten slots", () => {
    const start = seededRows(defaultVideoScriptEditorState(), [["a", "b", "c", "d"]]);
    const wide = setSlotCount(start, MAX_VIDEO_SCRIPT_SLOTS);
    expect(wide.slotCount).toBe(MAX_VIDEO_SCRIPT_SLOTS);
    expect(wide.columns).toHaveLength(MAX_VIDEO_SCRIPT_SLOTS);
    expect(wide.rows[0].slots).toHaveLength(MAX_VIDEO_SCRIPT_SLOTS);
    expect(wide.rows[0].slots.slice(0, 4)).toEqual(["a", "b", "c", "d"]);
    // Beyond ten is refused, not silently accepted.
    expect(setSlotCount(wide, 12).slotCount).toBe(MAX_VIDEO_SCRIPT_SLOTS);
  });

  it("spreads an even timing template across the duration", () => {
    expect(evenTimingTemplate(4, 8)).toEqual([0, 2.67, 5.33, 8]);
    expect(evenTimingTemplate(1, 8)).toEqual([0]);
  });
});

describe("matrix drop targets", () => {
  it("binds a pool to a slot column without touching any row", () => {
    const state = seededRows(poolState(["a1", "a2"]), [["a1", "a2"]]);
    const bound = bindColumn(state, 1, { kind: "pool", poolId: "pool_a" });

    expect(bound.columns[1]).toEqual({ kind: "pool", poolId: "pool_a" });
    // A column drop is a generation instruction, so the matrix is untouched.
    expect(bound.rows[0].slots).toEqual(state.rows[0].slots);
    expect(bound.rows[0].edited).toBe(false);
    // Binding a column is the per-slot workflow by definition.
    expect(bound.workflow).toBe("per-slot");
  });

  it("overrides only one row's slot on a cell drop and marks it edited", () => {
    const state = seededRows(poolState(["a1", "a2"]), [["a1", "a2"], ["a2", "a1"]]);
    const edited = setRowSlot(state, state.rows[0].id, 1, "a9");

    expect(edited.rows[0].slots[1]).toBe("a9");
    expect(edited.rows[0].edited).toBe(true);
    expect(edited.rows[1].slots).toEqual(state.rows[1].slots);
    expect(edited.rows[1].edited).toBe(false);
    // Cell drops never rebind a column.
    expect(edited.columns[1]).toEqual({ kind: "manual" });
  });

  it("reorders keyframes inside one row as an edit", () => {
    const state = seededRows(poolState(["a1", "a2", "a3"]), [["a1", "a2", "a3"]]);
    const moved = moveRowSlot(state, state.rows[0].id, 0, 2);
    expect(moved.rows[0].slots.slice(0, 3)).toEqual(["a2", "a3", "a1"]);
    expect(moved.rows[0].edited).toBe(true);
  });
});

describe("edited-row protection across regenerate", () => {
  it("replaces only unedited rows and keeps edited rows in place", () => {
    const current = [
      rowFromAssetIds(["a1", "a2"], 4),
      { ...rowFromAssetIds(["b1", "b2"], 4), edited: true },
      rowFromAssetIds(["c1", "c2"], 4)
    ];

    const outcome = regenerateRows(current, [["x1", "x2"], ["y1", "y2"], ["z1", "z2"]], 4);

    expect(outcome.preserved).toBe(1);
    expect(outcome.generated).toBe(3);
    expect(outcome.rows.map((row) => row.slots.slice(0, 2))).toEqual([
      ["x1", "x2"],
      ["b1", "b2"],
      ["y1", "y2"],
      ["z1", "z2"]
    ]);
    // The protected row keeps its identity, not just its images.
    expect(outcome.rows[1].id).toBe(current[1].id);
    expect(outcome.rows[1].edited).toBe(true);
  });

  it("never re-adds a generated row an edited row already covers", () => {
    const current = [{ ...rowFromAssetIds(["a1", "a2"], 4), edited: true }];
    const outcome = regenerateRows(current, [["a1", "a2"], ["b1", "b2"]], 4);

    expect(outcome.skippedDuplicates).toBe(1);
    expect(outcome.rows).toHaveLength(2);
    expect(outcome.rows[0].id).toBe(current[0].id);
    expect(outcome.rows[1].slots.slice(0, 2)).toEqual(["b1", "b2"]);
  });

  it("treats hand-authored and duplicated rows as protected", () => {
    const state = seededRows(poolState(["a1"]), [["a1", "a2"]]);
    const added = addRow(state);
    const duplicated = duplicateRow(added, state.rows[0].id);

    expect(added.rows[1].origin).toBe("manual");
    expect(added.rows[1].edited).toBe(true);
    expect(duplicated.rows[1].origin).toBe("manual");
    expect(duplicated.rows[1].edited).toBe(true);
    expect(duplicated.rows[1].id).not.toBe(state.rows[0].id);

    const outcome = regenerateRows(duplicated.rows, [["q1", "q2"]], 4);
    expect(outcome.preserved).toBe(2);
  });

  it("drops edited rows only on an explicit discard", () => {
    const state = seededRows(poolState(["a1"]), [["a1"], ["a2"]]);
    const edited = setRowSlot(state, state.rows[1].id, 0, "a9");
    expect(clearEditedRows(edited).rows).toHaveLength(1);
    // Releasing one row's protection is also explicit.
    expect(resetRowEdits(edited, edited.rows[1].id).rows[1].edited).toBe(false);
  });

  it("reorders rows without changing their provenance", () => {
    const state = seededRows(poolState(["a1"]), [["a1"], ["a2"], ["a3"]]);
    const moved = moveRow(state, 2, 0);
    expect(moved.rows.map((row) => row.slots[0])).toEqual(["a3", "a1", "a2"]);
    expect(moved.rows.every((row) => !row.edited)).toBe(true);
  });
});

describe("planner-to-UI glue", () => {
  it("maps the two generator workflows onto the engine's generator shape", () => {
    const sequence = poolState(["a1", "a2", "a3"], { workflow: "sequence", sequenceMode: "rotation" });
    expect(videoScriptGenerator(sequence)).toEqual({
      workflow: "sequence",
      poolId: "pool_a",
      slotCount: 4,
      mode: "rotation"
    });

    const perSlot = bindColumn(poolState(["a1", "a2"]), 0, { kind: "pool", poolId: "pool_a" });
    expect(videoScriptGenerator({ ...perSlot, strategy: "zip", sampleSize: 3 })).toEqual({
      workflow: "per-slot",
      slots: perSlot.columns.slice(0, 4),
      strategy: "zip",
      sampleSize: 3
    });
  });

  it("generator preview numbers come from the planner for a fixed fixture", () => {
    const state = poolState(["a1", "a2", "a3", "a4"], {
      workflow: "sequence",
      sequenceMode: "combination",
      slotCount: 2
    });
    const plan = planVideoScriptGenerator(state);
    const direct = planVideoScript({
      pools: [{ id: "pool_a", assetIds: ["a1", "a2", "a3", "a4"] }],
      generator: { workflow: "sequence", poolId: "pool_a", slotCount: 2, mode: "combination" },
      settings: state.settings,
      seed: state.seed,
      hardCap: state.hardCap
    });

    // 4 choose 2 = 6 ordered keyframe rows.
    expect(plan.preview.rawRowCount).toBe(6);
    expect(plan.preview.uniqueRowCount).toBe(6);
    expect(plan.rows.map((row) => row.assetIds)).toEqual(direct.rows.map((row) => row.assetIds));
  });

  it("batch preview shows the raw -> unique -> capped -> cost chain over the matrix rows", () => {
    const state = seededRows(poolState(["a1", "a2"]), [
      ["a1", "a2"],
      ["a2", "a1"],
      ["a1", "a2"] // duplicate, removed by the planner's row dedupe
    ]);
    const plan = planVideoScriptBatch(state, videoScriptPrompts([PROMPT], state.promptIds));

    expect(plan.preview.rawRowCount).toBe(3);
    expect(plan.preview.uniqueRowCount).toBe(2);
    expect(plan.preview.cappedRowCount).toBe(2);
    expect(plan.preview.validRowCount).toBe(2);
    // 8s HD draft at $0.06/s = $0.48 a row.
    expect(plan.preview.estimatedTotalUsd).toBeCloseTo(0.96, 6);
    expect(plan.preview.equation).toBe("2 image rows × 1 prompt = 2 jobs");
  });

  it("only the explicit Cartesian prompt mode multiplies rows", () => {
    const second: PromptRecord = { id: "vp_slow", prompt: "Slow push through the corridor." };
    const state = seededRows(poolState(["a1", "a2"], { promptIds: [PROMPT.id, second.id] }), [
      ["a1", "a2"],
      ["a2", "a1"]
    ]);

    const rotated = planVideoScriptBatch({ ...state, promptMode: "rotate" }, videoScriptPrompts([PROMPT, second], state.promptIds));
    expect(rotated.preview.promptExpandedRowCount).toBe(2);

    const cartesian = planVideoScriptBatch(
      { ...state, promptMode: "cartesian" },
      videoScriptPrompts([PROMPT, second], state.promptIds)
    );
    expect(cartesian.preview.promptExpandedRowCount).toBe(4);
    expect(cartesian.preview.equation).toBe("2 image rows × 2 prompts = 4 jobs");
  });

  it("applies the hard cap and reports the truncation", () => {
    const state = seededRows(poolState(["a1", "a2", "a3"], { hardCap: 2 }), [["a1"], ["a2"], ["a3"]]);
    const plan = planVideoScriptBatch(state, videoScriptPrompts([PROMPT], state.promptIds));

    expect(plan.preview.cappedRowCount).toBe(2);
    expect(plan.warnings.some((warning) => warning.code === "cap_truncated")).toBe(true);
  });

  it("carries the batch timing template and per-row overrides into the plan", () => {
    const base = seededRows(poolState(["a1", "a2"]), [["a1", "a2"], ["a2", "a1"]]);
    const state: VideoScriptEditorState = { ...base, timingMode: "timed", timingTemplate: [0, 6] };
    const overridden = setRowTiming(state, state.rows[1].id, [1, 7]);
    const plan = planVideoScriptBatch(overridden, videoScriptPrompts([PROMPT], state.promptIds));

    expect(plan.rows[0].timedKeyframes).toEqual([
      [0, "a1"],
      [6, "a2"]
    ]);
    expect(plan.rows[1].timedKeyframes).toEqual([
      [1, "a2"],
      [7, "a1"]
    ]);
    expect(plan.preview.invalidRowCount).toBe(0);
  });

  it("surfaces per-row validation errors instead of dropping the row", () => {
    const state: VideoScriptEditorState = {
      ...seededRows(poolState(["a1", "a2", "a3"]), [["a1", "a2", "a3"]]),
      timingMode: "timed",
      timingTemplate: [0, 9, 4]
    };
    const plan = planVideoScriptBatch(state, videoScriptPrompts([PROMPT], state.promptIds));

    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].errors.map((error) => error.code)).toContain("timing_order");
    expect(plan.rows[0].errors.map((error) => error.code)).toContain("timing_range");
    expect(plan.preview.validRowCount).toBe(0);
  });
});

describe("source browser filtering", () => {
  const collection: AssetCollection = {
    id: "col_a",
    name: "Corridor",
    members: [
      { assetId: "img_1", kind: "asset", addedAt: 1 },
      { assetId: "vid_1", kind: "asset", addedAt: 2 },
      { assetId: "missing", kind: "asset", addedAt: 3 },
      { assetId: "img_1", kind: "asset", addedAt: 4 }
    ],
    createdAt: 1,
    updatedAt: 1
  };

  function asset(id: string, overrides: Partial<AssetRecord> = {}): AssetRecord {
    return {
      id,
      createdAt: "2026-08-05T00:00:00.000Z",
      timestamp: 1,
      imageDataUrl: "",
      imageUrl: `/api/outputs/${id}/image`,
      image_url: "",
      sampleUrl: "",
      model: "pro-preview",
      prompt: "",
      status: "complete",
      payload: {},
      references: [],
      ...overrides
    };
  }

  it("keeps only resolvable image members, deduplicated", () => {
    const assets = [asset("img_1"), asset("vid_1", { mediaType: "video", imageUrl: "", videoUrl: "/v.mp4" })];
    expect(videoScriptPoolAssetIds(collection, assets)).toEqual(["img_1"]);
  });
});
