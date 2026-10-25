import { describe, expect, it } from "vitest";
import { imageAdapter } from "@/lib/operations/image";
import { reconcileOperation, requestedOperation } from "@/lib/queue/operation";

describe("the operation a queue request names", () => {
  it("takes the job's operation first, then the payload's tag, then what the lane implies", () => {
    expect(requestedOperation("image", { prompt: "a flower" })).toBe("generate");
    expect(requestedOperation("image", { operation: "flux3-image" })).toBe("flux3-image");
    expect(requestedOperation("image", { operation: "generate" }, " flux3-image ")).toBe("flux3-image");
    expect(requestedOperation("video", { mode: "t2v" })).toBe("t2v");
    expect(requestedOperation("video", { operation: "video-edit" })).toBe("video-edit");
    expect(requestedOperation("tool", { tool: "deblur", operation: "ignored" })).toBe("deblur");
    expect(requestedOperation("video", {})).toBe("");
  });
});

describe("a job and its body naming one product", () => {
  it("tags the body when only the job names FLUX 3 Image, and renames the job when only the body does", () => {
    const fromJob = reconcileOperation({ kind: "image", operation: "flux3-image", body: { mode: "t2i", prompt: "a fox" } });
    expect(fromJob).toMatchObject({ operation: "flux3-image", body: { operation: "flux3-image", mode: "t2i" } });

    const fromBody = reconcileOperation({ kind: "image", operation: "generate", body: { operation: "flux3-image", prompt: "a fox" } });
    expect(fromBody).toMatchObject({ operation: "flux3-image", body: { operation: "flux3-image" } });
  });

  it("does the same for the video tools, and lets the job win when the two disagree", () => {
    expect(reconcileOperation({ kind: "video", operation: "t2v", body: { operation: "video-upscale" } }).operation).toBe("video-upscale");
    const disagreeing = reconcileOperation({ kind: "video", operation: "video-edit", body: { operation: "video-upscale" } });
    expect(disagreeing).toMatchObject({ operation: "video-edit", body: { operation: "video-edit" } });
  });

  it("leaves default products and tools exactly as they were", () => {
    const flux2 = { kind: "image" as const, operation: "generate", body: { prompt: "a flower" } };
    const video = { kind: "video" as const, operation: "i2v", body: { mode: "i2v", operation: "i2v" } };
    const tool = { kind: "tool" as const, operation: "deblur", body: { tool: "deblur", operation: "flux3-image" } };
    expect(reconcileOperation(flux2)).toBe(flux2);
    expect(reconcileOperation(video)).toBe(video);
    expect(reconcileOperation(tool)).toBe(tool);
  });

  it("matters because the image lane picks its endpoint by the body's tag", async () => {
    const body = { mode: "t2i", prompt: "a glass fox at dawn", settings: { resolution: "2k" } };
    const untagged = await imageAdapter.prepare(body, "http://localhost");
    const tagged = await imageAdapter.prepare(reconcileOperation({ kind: "image", operation: "flux3-image", body }).body, "http://localhost");
    expect(untagged).toMatchObject({ endpoint: "flux-2-pro-preview" });
    expect(tagged).toMatchObject({ endpoint: "flux-3-image", payload: { resolution: "2k" } });
  });
});
