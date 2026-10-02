import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
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

  it("counts only outputs that have an image against a page, so video sidecars cannot empty it", async () => {
    const root = await createTempUiWorkspace();
    const outputs = path.join(root, "outputs", "flux-api-control-surface");
    // Video tools keep image-less sidecars in sibling folders that sort ahead of the dated image folders.
    for (const [folder, count] of [["video", 4], ["video-edit", 2], ["video-trim", 1]] as const) {
      await mkdir(path.join(outputs, folder, "2026-09-12"), { recursive: true });
      for (let index = 0; index < count; index += 1) {
        await writeFile(path.join(outputs, folder, "2026-09-12", `2026-09-12T10-0${index}-00-000Z_clip.json`), JSON.stringify({ id: `${folder}-${index}` }));
      }
    }
    await mkdir(path.join(outputs, "2026-10-02"), { recursive: true });
    for (const name of ["a-older", "b-newer"]) {
      const base = path.join(outputs, "2026-10-02", `2026-10-02_2026-10-02T00-00-00-000Z_${name}`);
      await writeFile(`${base}.json`, JSON.stringify({ id: name, payload: { prompt: name } }));
      await writeFile(`${base}.png`, "image");
    }

    const { readLocalOutputAssets } = await import("@/lib/server-output-store");
    // Seven sidecars sit ahead of the images; a page of two still holds the two images.
    expect((await readLocalOutputAssets({ limit: 2 })).map((asset) => asset.id)).toEqual(["b-newer", "a-older"]);
    expect((await readLocalOutputAssets({ limit: 1, offset: 1 })).map((asset) => asset.id)).toEqual(["a-older"]);
    expect(await readLocalOutputAssets({ limit: 5, offset: 2 })).toEqual([]);
  });

  it("shares a local image index until it is explicitly invalidated", async () => {
    const root = await createTempUiWorkspace();
    const outputDir = path.join(root, "outputs", "flux-api-control-surface", "2026-08-21");
    const base = path.join(outputDir, "2026-08-21_2026-08-21T00-00-00-000Z_cached-output");
    await mkdir(outputDir, { recursive: true });
    await writeFile(`${base}.json`, JSON.stringify({ id: "cached-output" }));
    await writeFile(`${base}.png`, "image");

    const { findLocalOutputImage, invalidateLocalOutputImageIndex } = await import("@/lib/server-output-store");
    const cachedImage = await findLocalOutputImage("cached-output");
    expect(cachedImage?.imagePath).toMatch(/cached-output\.png$/);

    await unlink(`${base}.png`);
    expect(await findLocalOutputImage("cached-output")).toEqual(cachedImage);

    invalidateLocalOutputImageIndex();
    expect(await findLocalOutputImage("cached-output")).toBeNull();
  });
});
