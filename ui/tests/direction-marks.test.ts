import { describe, expect, it } from "vitest";
import { hasDirectionMark } from "@/components/direction-marks";
import { cameraSections } from "@/lib/camera-language";

describe("visual direction marks", () => {
  it("gives every term outside the pose-glyph sections its own mark", () => {
    const iconSections = cameraSections.filter((section) => section.glyph === "icon");
    expect(iconSections).toHaveLength(11);
    const missing = iconSections.flatMap((section) => section.terms.filter((term) => !hasDirectionMark(term.id)).map((term) => term.id));
    expect(missing).toEqual([]);
  });
});
