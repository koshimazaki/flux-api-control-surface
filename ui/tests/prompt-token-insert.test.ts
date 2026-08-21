import { describe, expect, it } from "vitest";
import { insertPromptToken } from "@/lib/prompt-utils";

describe("insertPromptToken", () => {
  it("appends when there is no live caret", () => {
    // The regression this guards: a blurred textarea reports selectionStart 0,
    // which is a real number, so a `?? text.length` fallback never fires and the
    // token was prepended to the prompt instead of appended.
    const result = insertPromptToken("a glass flower", "@char", null);
    expect(result.text).toBe("a glass flower @char");
    expect(result.cursor).toBe(result.text.length);
  });

  it("does not prepend when the caret offset is a real zero but unfocused", () => {
    const blurred = insertPromptToken("a glass flower", "@char", null);
    const focusedAtZero = insertPromptToken("a glass flower", "@char", { start: 0, end: 0 });
    expect(blurred.text).toBe("a glass flower @char");
    expect(focusedAtZero.text).toBe("@char a glass flower");
    expect(blurred.text).not.toBe(focusedAtZero.text);
  });

  it("inserts at the caret when the editor is focused", () => {
    const result = insertPromptToken("a glass flower", "@style1", { start: 8, end: 8 });
    expect(result.text).toBe("a glass @style1 flower");
    expect(result.text.slice(0, result.cursor)).toBe("a glass @style1");
  });

  it("replaces the selected range", () => {
    const result = insertPromptToken("a glass flower", "@env", { start: 2, end: 7 });
    expect(result.text).toBe("a @env flower");
  });

  it("pads only where a space is missing", () => {
    expect(insertPromptToken("a glass ", "@char", { start: 8, end: 8 }).text).toBe("a glass @char");
    expect(insertPromptToken("", "@char", null).text).toBe("@char");
  });

  it("ignores a blank token", () => {
    const result = insertPromptToken("a glass flower", "   ", { start: 2, end: 2 });
    expect(result.text).toBe("a glass flower");
  });

  it("clamps an out-of-range caret instead of corrupting the text", () => {
    const result = insertPromptToken("short", "@char", { start: 999, end: 999 });
    expect(result.text).toBe("short @char");
  });

  it("tolerates an inverted selection", () => {
    const result = insertPromptToken("a glass flower", "@pose", { start: 7, end: 2 });
    expect(result.text).toBe("a glass @pose flower");
  });
});
