import { describe, expect, it } from "vitest";
import {
  selectorGroupClassName,
  selectorOptionClassName,
  selectorVariants
} from "@/lib/selector-variants";

describe("selector variants", () => {
  it("records every supported selector anatomy", () => {
    expect(selectorVariants).toEqual(["tabs", "segmented", "raised", "icon-rail"]);
  });

  it("builds stable group and option state classes", () => {
    expect(selectorGroupClassName("segmented", "workspaceMediaSwitch")).toBe(
      "selectorGroup selectorGroup-segmented workspaceMediaSwitch"
    );
    expect(selectorOptionClassName("raised", true, "presetToggle")).toBe(
      "selectorOption selectorOption-raised active presetToggle"
    );
    expect(selectorOptionClassName("tabs", false, "tabButton")).toBe(
      "selectorOption selectorOption-tabs tabButton"
    );
  });
});
