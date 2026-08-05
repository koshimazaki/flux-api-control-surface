import { describe, expect, it, vi } from "vitest";
import {
  buildFlux3VideoPayload,
  flux3KeyframeCount,
  flux3RequestBlocker,
  flux3TimedKeyframeBlocker,
  flux3TimedKeyframes,
  redactFlux3Payload
} from "@/lib/flux3-video";
import { planVideoScript, type VideoScriptPlan } from "@/lib/video-script-plan";
import {
  VIDEO_SCRIPT_QUEUE_ROUTE,
  buildVideoScriptQueueJobs,
  enqueueVideoScriptPlan,
  videoScriptKeyframeSource
} from "@/lib/video-script/enqueue";

const PROMPT = { id: "vp_neon", text: "Drift through the neon corridor." };

function evenPlan(): VideoScriptPlan {
  return planVideoScript({
    manualRows: [{ id: "row_a", assetIds: ["img_1", "img_2"] }, { id: "row_b", assetIds: ["img_2", "img_3"] }],
    prompts: [PROMPT],
    settings: { duration: 8, resolution: "hd", draft: true }
  });
}

function timedPlan(): VideoScriptPlan {
  return planVideoScript({
    manualRows: [{ id: "row_t", assetIds: ["img_1", "img_2", "img_3"] }],
    prompts: [PROMPT],
    timingMode: "timed",
    timingTemplate: [0, 3.5, 8],
    settings: { duration: 8, resolution: "hd", draft: true }
  });
}

describe("video script queue payloads", () => {
  it("builds one video-lane job per row with full batch metadata", () => {
    const jobs = buildVideoScriptQueueJobs(evenPlan(), {
      batchId: "vsb_test",
      sourceCollectionIds: ["col_a"],
      batchLabel: "Video Script"
    });

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.kind)).toEqual(["video", "video"]);
    expect(jobs.map((job) => job.operation)).toEqual(["i2v", "i2v"]);
    expect(jobs.map((job) => [job.batchId, job.batchIndex, job.batchTotal])).toEqual([
      ["vsb_test", 0, 2],
      ["vsb_test", 1, 2]
    ]);

    expect(jobs[0].payload).toMatchObject({
      mode: "i2v",
      prompt: PROMPT.text,
      duration: 8,
      resolution: "hd",
      draft: true,
      generateAudio: true,
      aspectRatio: "16:9",
      safetyTolerance: 2,
      keyframes: ["/api/outputs/img_1/image", "/api/outputs/img_2/image"],
      keyframeAssetIds: ["img_1", "img_2"],
      promptIds: ["vp_neon"],
      sourceCollectionIds: ["col_a"],
      batchId: "vsb_test",
      batchIndex: 0,
      batchTotal: 2,
      rowId: "row_a"
    });
    // Provenance travels as ids and resolvable URLs; never base64, never a key.
    expect(JSON.stringify(jobs)).not.toMatch(/data:|apiKey/);
    expect(jobs[0].sourceAssetIds).toEqual(["img_1", "img_2"]);
    expect(jobs[0].estimatedUsd).toBeCloseTo(0.48, 6);
  });

  it("serializes timed rows as [seconds, image] pairs on the additive field", () => {
    const [job] = buildVideoScriptQueueJobs(timedPlan(), { batchId: "vsb_timed" });

    expect(job.payload.timedKeyframes).toEqual([
      [0, "/api/outputs/img_1/image"],
      [3.5, "/api/outputs/img_2/image"],
      [8, "/api/outputs/img_3/image"]
    ]);
    // Even-row serialization is not also emitted for a timed row.
    expect(job.payload).not.toHaveProperty("keyframes");
    expect(job.payload.keyframeAssetIds).toEqual(["img_1", "img_2", "img_3"]);
  });

  it("holds back rows that still have validation errors", () => {
    const plan = planVideoScript({
      manualRows: [{ id: "ok", assetIds: ["img_1", "img_2"] }, { id: "empty", assetIds: [] }],
      prompts: [PROMPT],
      settings: { duration: 8 }
    });
    const jobs = buildVideoScriptQueueJobs(plan, { batchId: "vsb_partial" });

    expect(plan.rows).toHaveLength(2);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].batchTotal).toBe(1);
    expect(jobs[0].payload.rowId).toBe("ok");
  });

  it("survives queue-descriptor sanitization with its provenance intact", async () => {
    const { buildQueueJobDescriptor } = await import("@/lib/queue/descriptors");
    const [job] = buildVideoScriptQueueJobs(timedPlan(), { batchId: "vsb_desc", sourceCollectionIds: ["col_a"] });
    const descriptor = buildQueueJobDescriptor({
      jobId: "job_1",
      kind: "video",
      operation: job.operation,
      body: job.payload
    });

    // Nothing was redacted, so the job stays replayable after a server restart.
    expect(descriptor.recoverable).toBe(true);
    expect(descriptor.redactedKeys).toBeUndefined();
    expect(descriptor.body).toMatchObject({
      keyframeAssetIds: ["img_1", "img_2", "img_3"],
      promptIds: ["vp_neon"],
      sourceCollectionIds: ["col_a"],
      batchId: "vsb_desc",
      rowId: "row_t"
    });
    expect(descriptor.body.timedKeyframes).toEqual([
      [0, "/api/outputs/img_1/image"],
      [3.5, "/api/outputs/img_2/image"],
      [8, "/api/outputs/img_3/image"]
    ]);
  });

  it("prefers a caller-supplied media URL over the default outputs route", () => {
    expect(videoScriptKeyframeSource("img_1")).toBe("/api/outputs/img_1/image");
    expect(videoScriptKeyframeSource("img_1", () => "https://cdn.example/frame.png")).toBe(
      "https://cdn.example/frame.png"
    );
    const [job] = buildVideoScriptQueueJobs(evenPlan(), {
      batchId: "vsb_resolved",
      resolveAssetSource: (assetId) => (assetId === "img_1" ? "/api/outputs/other/image" : undefined)
    });
    expect(job.payload.keyframes).toEqual(["/api/outputs/other/image", "/api/outputs/img_2/image"]);
  });
});

describe("video script enqueue request", () => {
  it("posts the batch to the server queue with wait:false", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, jobs: [{ id: "job_1" }, { id: "job_2" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const outcome = await enqueueVideoScriptPlan(evenPlan(), { batchId: "vsb_post" }, fetchMock as unknown as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(VIDEO_SCRIPT_QUEUE_ROUTE);
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body));
    expect(body.wait).toBe(false);
    expect(body.jobs).toHaveLength(2);
    expect(body.jobs[0]).toMatchObject({ kind: "video", batchId: "vsb_post", batchIndex: 0, batchTotal: 2 });
    expect(outcome.queued).toHaveLength(2);
    // No paid provider host is ever contacted from the client.
    expect(url).not.toMatch(/api\.bfl\.ai/);
  });

  it("does not call the queue when no row is enqueueable", async () => {
    const fetchMock = vi.fn();
    const plan = planVideoScript({ manualRows: [{ id: "empty", assetIds: [] }], prompts: [PROMPT] });
    const outcome = await enqueueVideoScriptPlan(plan, { batchId: "vsb_none" }, fetchMock as unknown as typeof fetch);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome.jobs).toHaveLength(0);
  });

  it("surfaces the queue's error message", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "Provide at least one job to enqueue." }), { status: 400 })
    );
    await expect(
      enqueueVideoScriptPlan(evenPlan(), { batchId: "vsb_bad" }, fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/at least one job/);
  });
});

describe("timed keyframe payload mapping", () => {
  it("serializes timed pairs onto the upstream keyframes field", () => {
    expect(
      buildFlux3VideoPayload({
        mode: "i2v",
        prompt: "walk the corridor",
        timedKeyframes: [
          [0, "frame-a"],
          [4, "frame-b"]
        ],
        duration: 8,
        aspectRatio: "16:9"
      })
    ).toEqual({
      mode: "i2v",
      prompt: "walk the corridor",
      aspect_ratio: "16:9",
      duration: 8,
      resolution: "hd",
      generate_audio: true,
      safety_tolerance: 2,
      draft: false,
      keyframes: [
        [0, "frame-a"],
        [4, "frame-b"]
      ]
    });
  });

  it("keeps the plain image array for even rows", () => {
    const payload = buildFlux3VideoPayload({
      mode: "i2v",
      prompt: "walk the corridor",
      keyframes: ["frame-a", "frame-b"],
      duration: 8
    });
    expect(payload.keyframes).toEqual(["frame-a", "frame-b"]);
  });

  it("counts keyframes from whichever timeline shape is present", () => {
    expect(flux3KeyframeCount({ keyframes: ["a", "b", ""] })).toBe(2);
    expect(flux3KeyframeCount({ timedKeyframes: [[0, "a"], [2, "b"], [4, "c"]] })).toBe(3);
    expect(flux3TimedKeyframes({ timedKeyframes: [[0, "a"], [1, ""]] })).toEqual([[0, "a"]]);
  });

  it("rejects out-of-order, out-of-range, and untimed-duration pairs", () => {
    expect(flux3TimedKeyframeBlocker([[0, "a"], [4, "b"]], 8)).toBeNull();
    expect(flux3TimedKeyframeBlocker([[4, "a"], [4, "b"]], 8)).toMatch(/strictly increase/i);
    expect(flux3TimedKeyframeBlocker([[0, "a"], [9, "b"]], 8)).toMatch(/within the 8s duration/i);
    expect(flux3TimedKeyframeBlocker([[-1, "a"], [4, "b"]], 8)).toMatch(/non-negative/i);
    expect(flux3TimedKeyframeBlocker([[0, "a"], [4, "b"]], "auto")).toMatch(/fixed duration/i);
    // The API ceiling still applies even when a caller asks for more.
    expect(flux3TimedKeyframeBlocker([[0, "a"], [21, "b"]], 25)).toMatch(/within 20 seconds/i);
  });

  it("applies the same rules through the shared request blocker", () => {
    expect(
      flux3RequestBlocker({
        mode: "i2v",
        prompt: "walk",
        timedKeyframes: [[0, "a"], [3, "b"], [6, "c"]],
        duration: 8
      })
    ).toBeNull();
    expect(
      flux3RequestBlocker({ mode: "i2v", prompt: "walk", timedKeyframes: [[0, "a"], [3, "b"]], duration: "auto" })
    ).toMatch(/fixed duration/i);
    expect(
      flux3RequestBlocker({
        mode: "i2v",
        prompt: "walk",
        timedKeyframes: Array.from({ length: 11 }, (_, index) => [index, `f${index}`] as [number, string]),
        duration: 15
      })
    ).toMatch(/up to ten/i);
  });

  it("still redacts timed conditioning media from saved payloads", () => {
    expect(
      redactFlux3Payload({ prompt: "keep", keyframes: [[0, "large-a"], [4, "large-b"]] })
    ).toEqual({ prompt: "keep", keyframes: "[2 image keyframes omitted]" });
  });
});
