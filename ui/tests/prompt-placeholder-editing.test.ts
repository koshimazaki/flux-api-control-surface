import { describe, expect, it } from "vitest";
import { extractPlaceholders, removePlaceholder } from "@/lib/prompt-placeholders";
import { isStylePresetActive, toggleStylePreset, VIDEO_STYLE_PRESETS } from "@/lib/video-prompt-templates";
import { addRow, removeRowSlot, setRowSlot } from "@/lib/video-script/rows";
import { defaultVideoScriptEditorState, type VideoScriptEditorState } from "@/lib/video-script/types";

describe("removePlaceholder", () => {
  it("drops the token and tidies a mid-sentence comma dangler", () => {
    const text = "Image 1 shows {subject}, {motion}, in {setting}.";
    const next = removePlaceholder(text, "motion");
    expect(next).toBe("Image 1 shows {subject}, in {setting}.");
    expect(extractPlaceholders(next)).toEqual(["subject", "setting"]);
  });

  it("cleans a dangling dash on a beat line", () => {
    const text = "{t1}s: image 1 — {beat}\n{t2}s: image 2 — settles";
    const next = removePlaceholder(text, "beat");
    expect(next).toBe("{t1}s: image 1\n{t2}s: image 2 — settles");
  });

  it("removes every occurrence of the same blank", () => {
    const next = removePlaceholder("{style} shot of a {style} scene.", "style");
    expect(extractPlaceholders(next)).toEqual([]);
  });
});

describe("toggleStylePreset", () => {
  const cinematic = VIDEO_STYLE_PRESETS.find((preset) => preset.id === "cinematic")!.value;
  const anime = VIDEO_STYLE_PRESETS.find((preset) => preset.id === "anime")!.value;

  it("fills the {style} blank on first use", () => {
    const next = toggleStylePreset("Animate this in {style}.", cinematic);
    expect(next).toContain(cinematic);
    expect(extractPlaceholders(next)).toEqual([]);
  });

  it("swaps one preset for another instead of stacking", () => {
    const first = toggleStylePreset("A quiet scene.", cinematic);
    const second = toggleStylePreset(first, anime);
    expect(second).toContain(anime);
    expect(second).not.toContain(cinematic);
  });

  it("clicking the active preset removes it", () => {
    const applied = toggleStylePreset("A quiet scene.", cinematic);
    expect(isStylePresetActive(applied, cinematic)).toBe(true);
    const removed = toggleStylePreset(applied, cinematic);
    expect(isStylePresetActive(removed, cinematic)).toBe(false);
    expect(removed).toContain("A quiet scene.");
  });
});

describe("removeRowSlot", () => {
  function stateWithRow(slots: (string | null)[]): { state: VideoScriptEditorState; rowId: string } {
    const base = addRow({ ...defaultVideoScriptEditorState(), slotCount: 4 });
    const rowId = base.rows[base.rows.length - 1].id;
    let state = base;
    slots.forEach((assetId, index) => {
      state = setRowSlot(state, rowId, index, assetId);
    });
    return { state, rowId };
  }

  it("compacts the gap so later keyframes slide left", () => {
    const { state, rowId } = stateWithRow(["a", "b", "c", "d"]);
    const next = removeRowSlot(state, rowId, 1);
    const row = next.rows.find((entry) => entry.id === rowId)!;
    expect(row.slots.slice(0, 4)).toEqual(["a", "c", "d", null]);
    expect(row.edited).toBe(true);
  });

  it("keeps the slot count stable", () => {
    const { state, rowId } = stateWithRow(["a", "b", null, null]);
    const before = state.rows.find((entry) => entry.id === rowId)!;
    const next = removeRowSlot(state, rowId, 0);
    const row = next.rows.find((entry) => entry.id === rowId)!;
    expect(row.slots.length).toBe(before.slots.length);
    expect(row.slots[0]).toBe("b");
  });
});
