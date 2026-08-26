import { describe, expect, it } from "vitest";
import { defaultSurfaceTheme, isSurfaceTheme, surfaceThemes } from "@/lib/surface-theme";

describe("surface theme preference", () => {
  it("starts first-time visitors on Reflective", () => {
    expect(defaultSurfaceTheme).toBe("reflective");
    expect(surfaceThemes.find((theme) => theme.id === defaultSurfaceTheme)?.label).toBe("Reflective");
  });

  it("accepts only named theme presets from storage", () => {
    for (const theme of surfaceThemes) expect(isSurfaceTheme(theme.id)).toBe(true);
    expect(isSurfaceTheme("unknown-theme")).toBe(false);
    expect(isSurfaceTheme(null)).toBe(false);
  });
});
