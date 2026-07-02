import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
let tempRoot: string | null = null;

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

async function createTempUiWorkspace() {
  tempRoot = await mkdtemp(path.join(tmpdir(), "bfl-output-store-"));
  const uiDir = path.join(tempRoot, "ui");
  await mkdir(uiDir, { recursive: true });
  process.chdir(uiDir);
  return tempRoot;
}

describe("server output store", () => {
  it("keeps hidden collection metadata out of the output manifest", async () => {
    const root = await createTempUiWorkspace();
    const outputDir = path.join(root, "outputs", "flux-api-control-surface", "2026-07-02");
    const hiddenDir = path.join(root, "outputs", "flux-api-control-surface", ".collections");
    const base = path.join(outputDir, "2026-07-02_2026-07-02T00-00-00-000Z_real-output");
    await mkdir(outputDir, { recursive: true });
    await mkdir(hiddenDir, { recursive: true });
    await writeFile(`${base}.json`, JSON.stringify({ id: "real-output", payload: { prompt: "A real output" } }));
    await writeFile(
      path.join(hiddenDir, "collections.json"),
      JSON.stringify([{ id: "collection-alien-creatures", name: "Alien Creatures", members: [] }])
    );

    const { readLocalOutputManifest } = await import("@/lib/server-output-store");
    const manifest = await readLocalOutputManifest();

    expect(manifest.map((item) => item.id)).toEqual(["real-output"]);
  });
});
