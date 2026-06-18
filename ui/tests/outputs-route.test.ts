import { describe, expect, it } from "vitest";
import { DEFAULT_OUTPUT_LIMIT, MAX_OUTPUT_LIMIT, outputPageFromUrl } from "@/lib/output-pagination";

describe("outputPageFromUrl", () => {
  it("defaults to a bounded recovery page", () => {
    expect(outputPageFromUrl("http://localhost/api/outputs")).toEqual({
      limit: DEFAULT_OUTPUT_LIMIT,
      offset: 0,
      includeData: false
    });
  });

  it("clamps large limits and accepts offsets", () => {
    expect(outputPageFromUrl("http://localhost/api/outputs?limit=999&offset=12&includeData=1")).toEqual({
      limit: MAX_OUTPUT_LIMIT,
      offset: 12,
      includeData: true
    });
  });
});
