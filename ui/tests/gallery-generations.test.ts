import { describe, expect, it } from "vitest";
import { galleryEntries, generationElapsed, generationPattern, trackGalleryGenerations } from "@/lib/gallery-generations";
import type { GenerationQueueJob } from "@/lib/generation-queue";
import type { AssetRecord } from "@/lib/types";

const job = (overrides: Partial<GenerationQueueJob> = {}): GenerationQueueJob => ({
  id: "job-a", kind: "image", lane: "image", operation: "generate", title: "Study", status: "running", createdAt: 100, startedAt: 200, ...overrides
});
const asset = (id: string): AssetRecord => ({ id, title: id, timestamp: 400, createdAt: "2026-09-12", imageDataUrl: "", imageUrl: "", image_url: "", sampleUrl: "", model: "flux", prompt: "", status: "complete", provider: "bfl", payload: {}, references: [] });

describe("gallery generation handoff", () => {
  it("ignores historic failures and completions while restoring active work", () => {
    const result = trackGalleryGenerations([], [job(), job({ id: "old", status: "complete", finishedAt: 90 }), job({ id: "failed", status: "failed", finishedAt: 80 })], [], 300);
    expect(result.map((entry) => entry.job.id)).toEqual(["job-a"]);
  });
  it("keeps the same slot when queue completion arrives before its output", () => {
    const pending = trackGalleryGenerations([], [job()], [], 0);
    const completeJob = job({ status: "complete", finishedAt: 400, resultAssetId: "output" });
    const waiting = trackGalleryGenerations(pending, [completeJob], [], 0);
    expect(galleryEntries([], waiting)[0].asset).toBeUndefined();
    const ready = trackGalleryGenerations(waiting, [completeJob], [asset("output")], 0);
    const entries = galleryEntries([asset("output")], ready);
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe(galleryEntries([], pending)[0].key);
    expect(entries[0].timestamp).toBe(100);
    expect(entries[0].asset?.id).toBe("output");
  });
  it("deduplicates an output arriving before its queue completion", () => {
    const tracks = trackGalleryGenerations([], [job({ providerRequestId: "output" })], [asset("output")], 0);
    expect(galleryEntries([asset("output")], tracks)).toHaveLength(1);
  });
  it("retains finished slots after queue cleanup, but never resurrects deleted media", () => {
    const tracks = [{ job: job({ status: "complete", resultAssetId: "output" }), assetId: "output", revealed: true }];
    const kept = trackGalleryGenerations(tracks, [], [asset("output")], 0);
    expect(kept[0].revealed).toBe(true);
    expect(galleryEntries([], tracks)).toEqual([]);
    expect(trackGalleryGenerations(tracks, [], [], 0)).toEqual([]);
  });
  it("keeps failure/retry in place and removes dismissed pending work", () => {
    const pending = trackGalleryGenerations([], [job()], [], 0);
    const failed = trackGalleryGenerations(pending, [job({ status: "failed", finishedAt: 500 })], [], 0);
    const retry = trackGalleryGenerations(failed, [job({ status: "queued" })], [], 0);
    expect(galleryEntries([], retry)[0].key).toBe(galleryEntries([], failed)[0].key);
    expect(trackGalleryGenerations(retry, [], [], 0)).toEqual([]);
  });
  it("doesn't let parallel jobs with the same title claim one another's result", () => {
    const tracks = trackGalleryGenerations([], [job({ resultAssetId: "a" }), job({ id: "job-b", kind: "video", resultAssetId: "b" })], [asset("a"), asset("b")], 0);
    expect(galleryEntries([asset("a"), asset("b")], tracks).map((entry) => [entry.generation?.job.id, entry.asset?.id])).toEqual([["job-a", "a"], ["job-b", "b"]]);
  });
});

describe("generation feedback", () => {
  it("keeps a job's pattern stable across polls and varies the pattern across jobs", () => {
    expect(generationPattern("job-a")).toEqual(generationPattern("job-a"));
    expect(new Set(Array.from({ length: 100 }, (_, i) => generationPattern(`job-${i}`).variant)).size).toBe(3);
  });
  it("reports real elapsed time without counting queued time or going negative", () => {
    expect(generationElapsed(job({ startedAt: undefined }), 60000)).toBeNull();
    expect(generationElapsed(job({ startedAt: 5000 }), 70100)).toBe("1:05");
    expect(generationElapsed(job({ startedAt: 5000 }), 1000)).toBe("0:00");
    expect(generationElapsed(job({ startedAt: 0, finishedAt: 3661000 }), 9999999)).toBe("1:01:01");
  });
});
