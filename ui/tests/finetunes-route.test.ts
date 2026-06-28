import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "@/app/api/finetunes/route";

const originalCwd = process.cwd();
let tempRoot = "";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/finetunes", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

describe("finetunes registry route", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "bfl-finetunes-route-"));
    await mkdir(path.join(tempRoot, "configs"));
    await mkdir(path.join(tempRoot, "ui"));
    process.chdir(path.join(tempRoot, "ui"));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("upserts, lists, clamps strength, validates finetuneId, and deletes", async () => {
    // Empty registry to start.
    expect(await (await GET()).json()).toEqual([]);

    // Missing finetuneId -> 400.
    const invalid = await POST(postRequest({ record: { label: "no id" } }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toMatch(/finetuneId/);

    // Upsert with an out-of-range strength -> clamped to 2, base model pinned.
    const created = await POST(
      postRequest({
        record: { finetuneId: "ft-klein-001", label: "Cyberflower", triggerWord: "bfl_x", defaultStrength: 5 }
      })
    );
    expect(created.status).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.record.defaultStrength).toBe(2);
    expect(createdBody.record.baseModel).toBe("flux2-klein-9b");
    const recordId = createdBody.record.id;

    // It is persisted to the gitignored config file.
    const filePath = path.join(tempRoot, "configs", "local_finetunes.json");
    const persisted = JSON.parse(await readFile(filePath, "utf8"));
    expect(persisted).toHaveLength(1);
    expect(persisted[0].finetuneId).toBe("ft-klein-001");

    // Update in place (same finetuneId), strength floored to 0.
    const updated = await POST(
      postRequest({ record: { finetuneId: "ft-klein-001", label: "Cyberflower v2", defaultStrength: -3 } })
    );
    const updatedBody = await updated.json();
    expect(updatedBody.record.id).toBe(recordId);
    expect(updatedBody.record.defaultStrength).toBe(0);

    const list = await (await GET()).json();
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("Cyberflower v2");

    // Delete by id.
    const deleted = await DELETE(new NextRequest(`http://localhost/api/finetunes?id=${recordId}`));
    expect(deleted.status).toBe(200);
    expect(await (await GET()).json()).toEqual([]);

    // Deleting a missing id -> 404.
    const missing = await DELETE(new NextRequest("http://localhost/api/finetunes?id=nope"));
    expect(missing.status).toBe(404);
  });

  it("refuses to overwrite a corrupt registry and surfaces a 500", async () => {
    const filePath = path.join(tempRoot, "configs", "local_finetunes.json");
    await writeFile(filePath, "{ not valid json", "utf8");

    // GET surfaces the corruption instead of silently returning [].
    expect((await GET()).status).toBe(500);

    // POST refuses to clobber an unreadable registry.
    const res = await POST(postRequest({ record: { finetuneId: "ft-x" } }));
    expect(res.status).toBe(500);

    // The corrupt file is left intact, not overwritten.
    expect(await readFile(filePath, "utf8")).toBe("{ not valid json");
  });

  it("treats valid JSON of the wrong shape (a non-array) as corrupt", async () => {
    const filePath = path.join(tempRoot, "configs", "local_finetunes.json");
    // Parses cleanly but is an object, not the expected array registry.
    await writeFile(filePath, '{"finetuneId":"ft-x"}', "utf8");

    expect((await GET()).status).toBe(500);

    // POST must not silently clobber the real (if misshapen) file with a fresh array.
    const res = await POST(postRequest({ record: { finetuneId: "ft-y" } }));
    expect(res.status).toBe(500);
    expect(await readFile(filePath, "utf8")).toBe('{"finetuneId":"ft-x"}');
  });
});
