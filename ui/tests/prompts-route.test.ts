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
