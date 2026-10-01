import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Only the network is faked: the download and the remote archive. Saving,
// the PNG text chunk and reading back are the real code.
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
vi.mock("@/lib/bfl-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bfl-server")>()),
  imageToDataUrl: vi.fn(async () => ({ buffer: ONE_PIXEL_PNG, contentType: "image/png", dataUrl: "" }))
}));
vi.mock("@/lib/remote-archive", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/remote-archive")>()),
  syncOutputToRemote: vi.fn(async () => ({ ok: true }))
}));

const originalCwd = process.cwd();
let tempRoot: string | null = null;

afterEach(async () => {
  process.chdir(originalCwd);
  vi.resetModules();
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
  tempRoot = null;
});

describe("FLUX 3 Image outputs", () => {
  it("read back through the output store with the same mode, settings and provenance they were saved with", async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), "bfl-flux3-image-"));
    await mkdir(path.join(tempRoot, "ui"), { recursive: true });
    process.chdir(path.join(tempRoot, "ui"));
    const { flux3ImageAdapter } = await import("@/lib/operations/flux3-image");
    const { readLocalOutputAssets } = await import("@/lib/server-output-store");

    const prepared = await flux3ImageAdapter.prepare({
      mode: "precise",
      prompt: "make it dusk",
      source: "data:image/png;base64,U09VUkNF",
      frame: { width: 400, height: 200 },
      regions: [{ x: 10, y: 20, width: 100, height: 80, action: "change", prompt: "a red scarf" }],
      settings: { resolution: "2k" },
      title: "dusk edit",
      sourceAssetIds: ["source-asset"]
    });
    if ("error" in prepared) throw new Error(prepared.error);
    const outcome = await flux3ImageAdapter.finalize({
      prepared,
      submitted: { id: "f3i-round-trip", cost: 10 },
      result: { status: "Ready", result: { sample: "https://delivery.example/f3i.png", prompt: "Expanded: dusk <sky_1>" } },
      pollingUrl: "https://poll.example/f3i",
      apiKey: "test",
      creditsBefore: 100,
      creditsAfter: 90,
      marks: { requestStartedAt: Date.now() - 5_000, submitStartedAt: Date.now() - 4_000, providerReadyAt: Date.now() - 1_000 }
    });

    const [asset] = (await readLocalOutputAssets()).filter((item) => item.id === "f3i-round-trip");
    const expected = {
      mode: "precise",
      settings: { resolution: "2k", aspectRatio: "auto" },
      boxes: 1,
      frame: { width: 400, height: 200 },
      expandedPrompt: "Expanded: dusk <sky_1>"
    };
    expect(asset.runSettings).toMatchObject({ model: "flux-3-image", flux3Image: expected });
    expect(asset).toMatchObject({ sourceAssetId: "source-asset", operation: "flux3-image:precise" });
    // The immediate response carries the same record.
    expect(outcome.response).toMatchObject({ flux3Image: expected, sourceAssetId: "source-asset", operation: "flux3-image:precise" });
    // The PNG's own text chunks were written after the FLUX 3 details were in, not before.
    const png = (await readFile(path.join(tempRoot, String(asset.localImagePath)))).toString("utf8");
    expect(png).toContain('"expandedPrompt":"Expanded: dusk <sky_1>"');
    expect(png).toContain('"operation":"flux3-image:precise"');
  });
});
