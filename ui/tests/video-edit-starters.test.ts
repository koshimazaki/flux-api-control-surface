import { describe, expect, it } from "vitest";
import { VIDEO_EDIT_PROMPT_STARTERS, activeStarterLabels, toggleStarterInPrompt } from "@/lib/video-edit";

const REMOVE = VIDEO_EDIT_PROMPT_STARTERS[0].prompt;
const RECOLOR = VIDEO_EDIT_PROMPT_STARTERS[1].prompt;

describe("prompt phrasing shortcuts", () => {
  it("writes a starter into an empty prompt", () => {
    expect(toggleStarterInPrompt("", REMOVE)).toBe(REMOVE);
  });

  it("adds to what is already written instead of replacing it", () => {
    const typed = "Keep the camera still.";
    expect(toggleStarterInPrompt(typed, REMOVE)).toBe(`${typed} ${REMOVE}`);
  });

  it("never leaves two copies of the same starter", () => {
    const once = toggleStarterInPrompt("", REMOVE);
    // Clicking the same shortcut again takes it back off rather than duplicating it.
    expect(toggleStarterInPrompt(once, REMOVE)).toBe("");
    expect(toggleStarterInPrompt(toggleStarterInPrompt(once, REMOVE), REMOVE)).toBe(REMOVE);
  });

  it("lets different starters compound", () => {
    const both = toggleStarterInPrompt(toggleStarterInPrompt("", REMOVE), RECOLOR);
    expect(both).toBe(`${REMOVE} ${RECOLOR}`);
    expect(activeStarterLabels(both)).toEqual(["Remove", "Recolor"]);
  });

  it("removes one starter from a compound prompt and leaves the rest tidy", () => {
    const both = toggleStarterInPrompt(toggleStarterInPrompt("", REMOVE), RECOLOR);
    const left = toggleStarterInPrompt(both, REMOVE);
    expect(left).toBe(RECOLOR);
    expect(left).not.toMatch(/\s{2,}/);
    expect(activeStarterLabels(left)).toEqual(["Recolor"]);
  });

  it("keeps typed text when a starter is taken back off", () => {
    const typed = "Keep the camera still.";
    const withStarter = toggleStarterInPrompt(typed, REMOVE);
    expect(toggleStarterInPrompt(withStarter, REMOVE)).toBe(typed);
  });

  it("reports nothing applied for an unrelated prompt", () => {
    expect(activeStarterLabels("Make it look like a painting.")).toEqual([]);
    expect(activeStarterLabels("")).toEqual([]);
  });
});
