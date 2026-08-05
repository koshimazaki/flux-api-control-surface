import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import { buildQueueJobDescriptor, sanitizeQueueRequestBody } from "@/lib/queue/descriptors";
import { queueDir, queueStorePath } from "@/lib/queue/paths";
import {
  isQuarantined,
  mutateQueueState,
  normalizeQueueState,
  readQueueState,
  recordQuarantineFailure
} from "@/lib/queue/store";
import type { ServerQueueJob } from "@/lib/queue/types";

function job(id: string): ServerQueueJob {
  return {
    id,
    kind: "image",
    lane: "image",
    operation: "generate",
    title: id,
    status: "queued",
    createdAt: 1,
    queuedAt: 1
  };
}

beforeEach(async () => {
  await rm(queueDir(), { recursive: true, force: true });
});

describe("generation queue store", () => {
  it("starts empty with conservative server defaults", async () => {
    const state = await readQueueState();
    expect(state.jobs).toEqual([]);
    expect(state.paused).toBe(false);
    expect(state.settings).toEqual({ globalLimit: 4, laneLimits: { image: 4, tool: 2, video: 2 } });
  });

  it("serializes concurrent mutations without losing a write", async () => {
    await Promise.all(
      Array.from({ length: 25 }, (_, index) => mutateQueueState((state) => state.jobs.push(job(`job-${index}`))))
    );
    const state = await readQueueState();
    expect(state.jobs).toHaveLength(25);
    expect(new Set(state.jobs.map((entry) => entry.id)).size).toBe(25);
  });

  it("writes atomically through a temp file and leaves no partial artifacts", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, index) => mutateQueueState((state) => state.jobs.push(job(`atomic-${index}`))))
    );
    const files = await readdir(queueDir());
    expect(files.filter((file) => file.endsWith(".tmp"))).toEqual([]);
    // A reader only ever sees a complete, parseable document.
    const raw = await readFile(queueStorePath(), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw).jobs).toHaveLength(10);
  });

  it("bumps a monotonic revision on every write and leaves no lock behind", async () => {
    await mutateQueueState((state) => state.jobs.push(job("rev-1")));
    expect((await readQueueState()).revision).toBe(1);
    await mutateQueueState((state) => state.jobs.push(job("rev-2")));
    expect((await readQueueState()).revision).toBe(2);
    expect((await readdir(queueDir())).filter((file) => file.endsWith(".lock"))).toEqual([]);
  });

  it("retries instead of clobbering a write that landed from another process", async () => {
    await mutateQueueState((state) => state.jobs.push(job("local-1")));
    let injected = false;

    await mutateQueueState(async (state) => {
      state.jobs.push(job("local-2"));
      if (injected) return;
      injected = true;
      // Simulate another process writing between our read and our write.
      const current = JSON.parse(await readFile(queueStorePath(), "utf8"));
      current.revision += 1;
      current.jobs.push(job("other-process"));
      await writeFile(queueStorePath(), JSON.stringify(current, null, 2), "utf8");
    });

    const ids = (await readQueueState()).jobs.map((entry) => entry.id);
    // The foreign write survives and ours is reapplied on top of it.
    expect(ids).toContain("other-process");
    expect(ids).toContain("local-1");
    expect(ids.filter((id) => id === "local-2")).toHaveLength(1);
  });

  it("repairs a corrupt or partial shape instead of trusting it", () => {
    const state = normalizeQueueState({ jobs: "nope", settings: { globalLimit: 900, laneLimits: { image: 0 } } });
    expect(state.jobs).toEqual([]);
    expect(state.settings.globalLimit).toBe(24);
    expect(state.settings.laneLimits.image).toBe(1);
  });

  it("quarantines a source only after repeated terminal failures", async () => {
    const state = await readQueueState();
    recordQuarantineFailure(state, "finger-1", "bad source image", 2, 1_000);
    expect(isQuarantined(state, "finger-1", 2)).toBe(false);
    recordQuarantineFailure(state, "finger-1", "bad source image", 2, 2_000);
    expect(isQuarantined(state, "finger-1", 2)).toBe(true);
    expect(isQuarantined(state, "finger-2", 2)).toBe(false);
  });
});

describe("queue descriptors", () => {
  it("never stores API keys or base64 media, and flags the body as unrecoverable", () => {
    const outcome = sanitizeQueueRequestBody({
      apiKey: "secret-key",
      prompt: "a fox at dawn",
      references: ["data:image/png;base64,AAAA"],
      nested: { authorization: "Bearer nope", keep: 5 }
    });
    expect(JSON.stringify(outcome.body)).not.toContain("secret-key");
    expect(JSON.stringify(outcome.body)).not.toContain("Bearer nope");
    expect(JSON.stringify(outcome.body)).not.toContain("data:image/png;base64");
    expect(outcome.body.prompt).toBe("a fox at dawn");
    expect(outcome.recoverable).toBe(false);
  });

  it("keeps prompt-only and asset-id bodies replayable after a restart", () => {
    const descriptor = buildQueueJobDescriptor({
      jobId: "job-1",
      kind: "image",
      operation: "generate",
      body: { prompt: "a fox at dawn", references: ["/api/outputs/ref-1/image"], width: 1024 }
    });
    expect(descriptor.recoverable).toBe(true);
    expect(descriptor.body).toMatchObject({ prompt: "a fox at dawn", width: 1024 });
  });

  it("keeps descriptors out of the published queue payload", async () => {
    await mutateQueueState((state) => {
      state.jobs.push(job("job-secret"));
      state.descriptors["job-secret"] = buildQueueJobDescriptor({
        jobId: "job-secret",
        kind: "image",
        operation: "generate",
        body: { prompt: "hidden" }
      });
    });
    const { publicQueueState } = await import("@/lib/queue/service");
    const published = publicQueueState(await readQueueState());
    expect(published).not.toHaveProperty("descriptors");
    expect(JSON.stringify(published)).not.toContain("hidden");
  });
});
