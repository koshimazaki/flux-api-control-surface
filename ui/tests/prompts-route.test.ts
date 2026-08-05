import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "@/app/api/prompts/route";

const originalCwd = process.cwd();
let tempRoot = "";

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

describe("prompts route delete/restore", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "bfl-prompts-route-"));
    await mkdir(path.join(tempRoot, "configs"));
    await mkdir(path.join(tempRoot, "ui"));
    process.chdir(path.join(tempRoot, "ui"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("archives deleted prompts and can restore them with POST", async () => {
    const promptsPath = path.join(tempRoot, "configs", "cybernetic_flower_flux2_prompts.json");
    const deletedPath = path.join(tempRoot, "configs", "deleted_prompts.json");
    const deletedRecord = {
      id: "prompt-to-restore",
      title: "Prompt to restore",
      prompt: "a restore prompt",
      prompt_format: "json"
    };
    const keptRecord = {
      id: "kept-prompt",
      title: "Kept prompt",
      prompt: "still active",
      prompt_format: "json"
    };

    await writeFile(promptsPath, `${JSON.stringify([deletedRecord, keptRecord], null, 2)}\n`, "utf8");

    const deleteResponse = await DELETE(new NextRequest("http://localhost/api/prompts?id=prompt-to-restore"));
    expect(deleteResponse.status).toBe(200);

    const activeAfterDelete = await readJson(promptsPath);
    expect(activeAfterDelete).toEqual([keptRecord]);

    const archive = await readJson(deletedPath);
    expect(archive).toHaveLength(1);
    expect(archive[0]).toMatchObject(deletedRecord);
    expect(typeof archive[0].deletedAt).toBe("string");
    expect(Number.isNaN(Date.parse(archive[0].deletedAt))).toBe(false);

    const postResponse = await POST(
      new NextRequest("http://localhost/api/prompts", {
        method: "POST",
        body: JSON.stringify({ record: deletedRecord }),
        headers: { "content-type": "application/json" }
      })
    );
    expect(postResponse.status).toBe(200);

    const activeAfterRestore = await readJson(promptsPath);
    expect(activeAfterRestore).toHaveLength(2);
    expect(activeAfterRestore[0]).toMatchObject({
      id: deletedRecord.id,
      title: deletedRecord.title,
      prompt: "a restore prompt",
      prompt_format: "json"
    });
    expect(typeof activeAfterRestore[0].updated_at).toBe("string");
    expect(activeAfterRestore[1]).toEqual(keptRecord);
  });
});

describe("prompts route media metadata", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "bfl-prompts-media-"));
    await mkdir(path.join(tempRoot, "configs"));
    await mkdir(path.join(tempRoot, "ui"));
    process.chdir(path.join(tempRoot, "ui"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function post(record: Record<string, unknown>) {
    const response = await POST(
      new NextRequest("http://localhost/api/prompts", {
        method: "POST",
        body: JSON.stringify({ record }),
        headers: { "content-type": "application/json" }
      })
    );
    return { response, data: await response.json() };
  }

  it("persists the additive video fields and drops unknown values", async () => {
    const promptsPath = path.join(tempRoot, "configs", "cybernetic_flower_flux2_prompts.json");
    const legacy = { id: "legacy", prompt: "a legacy prompt", prompt_format: "json" };
    await writeFile(promptsPath, `${JSON.stringify([legacy], null, 2)}\n`, "utf8");

    const { response, data } = await post({
      id: "video_beat_sheet",
      domain: "video_prompts",
      prompt: "0s: image 1 — still\n5s: image 2 — moves",
      prompt_format: "text",
      mediaType: "video",
      videoCategory: "sequence",
      tags: ["timed", "timed"],
      videoStructure: { setup: "one take", beats: [{ start: 0, text: "image 1 — still" }], camera: "static" },
      provenance: { generationId: "req_1", rating: 5, settings: { duration: 8 } },
      // Unknown values must not be persisted.
      mediaTypeGuess: "video"
    });

    expect(response.status).toBe(200);
    expect(data.record).toMatchObject({
      mediaType: "video",
      videoCategory: "sequence",
      tags: ["timed"],
      videoStructure: { setup: "one take", beats: [{ start: 0, text: "image 1 — still" }], camera: "static" },
      provenance: { generationId: "req_1", rating: 5, settings: { duration: 8 } }
    });

    const stored = await readJson(promptsPath);
    expect(stored[0].id).toBe("video_beat_sheet");
    expect(stored[0].videoCategory).toBe("sequence");
    // The untouched legacy record is byte-for-byte what it was.
    expect(stored[1]).toEqual(legacy);
  });

  it("refuses invalid media values without rejecting the save", async () => {
    const promptsPath = path.join(tempRoot, "configs", "cybernetic_flower_flux2_prompts.json");
    await writeFile(promptsPath, "[]\n", "utf8");

    const { response, data } = await post({
      id: "odd_record",
      prompt: "still saveable",
      mediaType: "hologram",
      videoCategory: "musical",
      tags: "not-an-array",
      videoStructure: "nope"
    });

    expect(response.status).toBe(200);
    expect(data.record.mediaType).toBeUndefined();
    expect(data.record.videoCategory).toBeUndefined();
    expect(data.record.tags).toBeUndefined();
    expect(data.record.videoStructure).toBeUndefined();
    expect(data.record.prompt).toBe("still saveable");
  });

  it("adds no media keys to a record saved without them", async () => {
    const promptsPath = path.join(tempRoot, "configs", "cybernetic_flower_flux2_prompts.json");
    await writeFile(promptsPath, "[]\n", "utf8");

    const { data } = await post({ id: "plain", prompt: "a plain prompt", prompt_format: "text" });
    expect(Object.keys(data.record).sort()).toEqual(["id", "prompt", "prompt_format", "updated_at"]);
  });

  it("clears a media field when a later save marks it invalid", async () => {
    const promptsPath = path.join(tempRoot, "configs", "cybernetic_flower_flux2_prompts.json");
    await writeFile(promptsPath, "[]\n", "utf8");

    await post({ id: "shifting", prompt: "one", mediaType: "video", videoCategory: "simple" });
    const { data } = await post({ id: "shifting", prompt: "two", videoCategory: "bogus" });

    // mediaType survives from the stored record; the bogus category is dropped.
    expect(data.record.mediaType).toBe("video");
    expect(data.record.videoCategory).toBeUndefined();
  });
});
