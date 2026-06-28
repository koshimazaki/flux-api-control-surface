import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/finetune/dataset/route";

// 1x1 PNG so the dataset builder has real, valid image bytes to persist.
const PNG_1x1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const originalCwd = process.cwd();
let tempRoot = "";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/finetune/dataset", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

function collection(imageDataUrl: string) {
  return {
    id: "col_1",
    name: "Klein Route Collection",
    triggerToken: "bfl_routeflower",
    captionGuide: "",
    createdAt: 0,
    updatedAt: 0,
    items: [
      {
        id: "item_1",
        source: "file",
        fileName: "subject.png",
        imageDataUrl,
        mimeType: "image/png",
        caption: "bfl_routeflower, a subject",
        addedAt: 0
      }
    ]
  };
}

describe("finetune dataset export route", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "bfl-dataset-route-"));
    await mkdir(path.join(tempRoot, "ui"));
    // The route writes to <cwd>/../outputs/...; cwd is the ui dir.
    process.chdir(path.join(tempRoot, "ui"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("writes a flat dataset folder and returns its paths", async () => {
    const res = await POST(postRequest({ collection: collection(PNG_1x1) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imageCount).toBe(1);
    expect(body.triggerToken).toBe("bfl_routeflower");
    expect(body.files).toContain("config.yaml");
    expect(body.files).toContain("README.md");

    // The files really landed on disk under the stamped job folder.
    const datasetsRoot = path.join(tempRoot, "outputs", "flux-api-control-surface", "finetune-datasets");
    const jobs = await readdir(datasetsRoot);
    expect(jobs).toHaveLength(1);
    const jobFiles = await readdir(path.join(datasetsRoot, jobs[0], "dataset"));
    expect(jobFiles.some((name) => name.endsWith(".png"))).toBe(true);
    expect(jobFiles.some((name) => name.endsWith(".txt"))).toBe(true);
  });

  it("returns 400 (not an unhandled 500) when an image is a spoofed non-image", async () => {
    // Valid data:image/png envelope, but the bytes ("hello") are not a real image.
    const res = await POST(postRequest({ collection: collection("data:image/png;base64,aGVsbG8=") }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not a valid PNG, JPEG, or WebP/);

    // Nothing should have been persisted on the validation failure.
    const datasetsRoot = path.join(tempRoot, "outputs", "flux-api-control-surface", "finetune-datasets");
    await expect(readdir(datasetsRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an empty collection with a 400", async () => {
    const res = await POST(postRequest({ collection: { ...collection(PNG_1x1), items: [] } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/requires a collection with items/);
  });
});
