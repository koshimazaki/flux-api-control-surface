import { describe, expect, it } from "vitest";
import { normalizeImageInput } from "@/lib/bfl-server";

// Regression for codex P2 on 9722528: BFL flux-tools want raw base64 or an
// HTTP(S) URL, not a data: URL. The dashboard produces data: URLs.
describe("normalizeImageInput", () => {
  it("strips the data:<mediatype>;base64, prefix to raw base64", () => {
    expect(normalizeImageInput("data:image/png;base64,iVBORw0KGgo")).toBe("iVBORw0KGgo");
    expect(normalizeImageInput("data:image/jpeg;base64,/9j/4AAQ")).toBe("/9j/4AAQ");
  });

  it("leaves HTTP(S) URLs untouched", () => {
    expect(normalizeImageInput("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(normalizeImageInput("http://localhost/x.jpg")).toBe("http://localhost/x.jpg");
  });

  it("leaves an already-raw base64 string untouched", () => {
    expect(normalizeImageInput("iVBORw0KGgoAAAANSUhEUg")).toBe("iVBORw0KGgoAAAANSUhEUg");
  });

  it("passes through empty / undefined unchanged", () => {
    expect(normalizeImageInput(undefined)).toBeUndefined();
    expect(normalizeImageInput("")).toBe("");
  });
});
