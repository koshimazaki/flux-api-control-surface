import { describe, expect, it } from "vitest";
import {
  bflModels,
  getBflImageTool,
  getBflModel,
  isBflPollFailureStatus,
  validateBflGenerationRequest,
  validateBflToolRequest
} from "@/lib/provider-registry";
import { estimateMinimumCost, modelOptions } from "@/lib/pricing";

describe("BFL provider registry", () => {
  it("keeps model options and pricing sourced from the registry", () => {
    expect(modelOptions).toEqual(bflModels.map(({ value, label }) => ({ value, label })));
    expect(getBflModel("pro-preview")?.endpoint).toBe("flux-2-pro-preview");
    expect(estimateMinimumCost("max", false)).toMatchObject({ credits: 7, label: "FLUX.2 [max]" });
  });

  it("validates output size and reference count for generation", () => {
    const model = getBflModel("pro-preview")!;

    expect(validateBflGenerationRequest({ model, width: 1024, height: 1024, referenceCount: 8 })).toBe("");
    expect(validateBflGenerationRequest({ model, width: 4096, height: 4096, referenceCount: 0 })).toMatch(/4 MP/);
    expect(validateBflGenerationRequest({ model, width: 1024, height: 1024, referenceCount: 9 })).toMatch(
      /8 reference images/
    );
  });

  it("recognizes terminal BFL polling statuses", () => {
    expect(isBflPollFailureStatus("Error")).toBe(true);
    expect(isBflPollFailureStatus("Request Moderated")).toBe(true);
    expect(isBflPollFailureStatus("Content Moderated")).toBe(true);
    expect(isBflPollFailureStatus("Task not found")).toBe(true);
    expect(isBflPollFailureStatus("Pending")).toBe(false);
    expect(isBflPollFailureStatus("Ready")).toBe(false);
  });

  it("validates outpaint canvas limits and fast-mode input shape", () => {
    const outpaint = getBflImageTool("outpaint")!;

    expect(
      validateBflToolRequest({
        tool: outpaint,
        image: "https://example.com/a.png",
        canvasWidth: 1536,
        canvasHeight: 1024,
        mode: "high"
      })
    ).toBe("");
    expect(
      validateBflToolRequest({
        tool: outpaint,
        image: "https://example.com/a.png",
        canvasWidth: 1536,
        canvasHeight: 1024,
        mode: "fast"
      })
    ).toMatch(/base64/);
    expect(
      validateBflToolRequest({
        tool: outpaint,
        image: "data:image/png;base64,abc",
        canvasWidth: 4096,
        canvasHeight: 4096,
        mode: "high"
      })
    ).toMatch(/4 MP/);
  });
});
