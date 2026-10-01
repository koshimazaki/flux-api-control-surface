import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "@/lib/video-file-response";

/**
 * Without range support a browser cannot seek, and it reports `duration` as
 * Infinity for a chunked response — which silently disabled the cut timeline,
 * since a clip with no length has nothing to place a bracket on.
 */
describe("range requests for saved clips", () => {
  it("treats a missing or open range as the whole file", () => {
    expect(parseRangeHeader(null, 1000)).toBeNull();
    expect(parseRangeHeader("bytes=-", 1000)).toBeNull();
    expect(parseRangeHeader("items=0-99", 1000)).toBeNull();
  });

  it("resolves an explicit range, inclusive of both ends", () => {
    expect(parseRangeHeader("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 });
    expect(parseRangeHeader("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    // An end past the file is clamped rather than refused.
    expect(parseRangeHeader("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("resolves a suffix range, which players use to read a trailing index", () => {
    expect(parseRangeHeader("bytes=-500", 1000)).toEqual({ start: 500, end: 999 });
    // A suffix longer than the file is the whole file.
    expect(parseRangeHeader("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("reports a range outside the file so it can be answered with 416", () => {
    expect(parseRangeHeader("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=2000-3000", 1000)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRangeHeader("bytes=500-499", 1000)).toBe("unsatisfiable");
  });

  it("ignores ranges against an empty file", () => {
    expect(parseRangeHeader("bytes=0-10", 0)).toBeNull();
  });
});
