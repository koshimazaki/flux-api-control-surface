import path from "node:path";
import { describe, expect, it } from "vitest";
import { toWorkspaceRelativePath, workspaceRoot } from "@/lib/local-paths";

describe("toWorkspaceRelativePath", () => {
  it("turns workspace absolute paths into portable display paths", () => {
    const absolute = path.join(workspaceRoot(), "outputs", "flux-api-control-surface", "image.png");

    expect(toWorkspaceRelativePath(absolute)).toBe("outputs/flux-api-control-surface/image.png");
  });

  it("does not expose parent-directory paths", () => {
    const outside = path.resolve(workspaceRoot(), "..", "private", "image.png");

    expect(toWorkspaceRelativePath(outside)).toBe("image.png");
  });
});
