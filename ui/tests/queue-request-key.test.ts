import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnqueueOptions } from "@/lib/queue/enqueue";
import { RequestKeyConflictError, entryRequestKey, requestKeyFrom } from "@/lib/queue/request-key";
import { mutateQueueState, readQueueState } from "@/lib/queue/store";

const { enqueueGenerationJobs, enqueueGenerationJob } = await import("@/lib/queue/enqueue");
const { stopQueueRunner } = await import("@/lib/queue/runner");

// Paused, so nothing queued here is ever submitted.
beforeEach(async () => {
  await mutateQueueState((state) => {
    state.jobs = [];
    state.descriptors = {};
    state.paused = true;
  });
});
afterEach(() => stopQueueRunner());

const run = (patch: Partial<EnqueueOptions> = {}, body: Record<string, unknown> = {}): EnqueueOptions => ({
  kind: "image",
  operation: "flux3-image",
  body: { mode: "t2i", prompt: "a glass fox", operation: "flux3-image", ...body },
  ...patch
});
const jobCount = async () => (await readQueueState()).jobs.length;

describe("request keys on the queue", () => {
  it("answers a request sent again with its key with the job the first send started", async () => {
    const first = await enqueueGenerationJob(run({ requestKey: "key-aaaaaaaa" }));
    // A resend can differ in what does not change the request: the API key it carries, whether it waits.
    const again = await enqueueGenerationJob(run({ requestKey: "key-aaaaaaaa" }, { apiKey: "test-key", wait: false }));
    expect(again).toMatchObject({ id: first.id, reused: true });
    expect(first.reused).toBeUndefined();
    expect(await jobCount()).toBe(1);
  });

  it("refuses the same key with a different request, and queues nothing", async () => {
    const first = await enqueueGenerationJob(run({ requestKey: "key-bbbbbbbb" }));
    const different = enqueueGenerationJob(run({ requestKey: "key-bbbbbbbb" }, { prompt: "a glass owl" }));
    await expect(different).rejects.toBeInstanceOf(RequestKeyConflictError);
    await expect(different).rejects.toThrow(first.id);
    expect(await jobCount()).toBe(1);
  });

  it("still queues every deliberate request: no key, or a new key, is a new job", async () => {
    await enqueueGenerationJob(run());
    await enqueueGenerationJob(run());
    await enqueueGenerationJob(run({ requestKey: "key-cccccccc" }));
    await enqueueGenerationJob(run({ requestKey: "key-dddddddd" }));
    expect(await jobCount()).toBe(4);
  });

  it("keys each job of a request that queues several by its position", async () => {
    const batch = (key: string) => [0, 1].map((index) => run({ requestKey: entryRequestKey(key, index, 2) }, { prompt: `frame ${index}` }));
    const first = await enqueueGenerationJobs(batch("key-eeeeeeee"));
    const again = await enqueueGenerationJobs(batch("key-eeeeeeee"));
    expect(again.map((job) => job.id)).toEqual(first.map((job) => job.id));
    expect(again.every((job) => job.reused)).toBe(true);
    expect(await jobCount()).toBe(2);
    expect(entryRequestKey("key-eeeeeeee", 0, 1)).toBe("key-eeeeeeee");
  });
});

describe("reading a request key", () => {
  const request = (key?: string) => new Request("http://localhost/api/bfl/flux3-image", { method: "POST", headers: key ? { "Idempotency-Key": key } : {} });

  it("takes the Idempotency-Key header, or requestKey in the body", () => {
    expect(requestKeyFrom(request("key-12345678"), { requestKey: "body-key-1" })).toEqual({ key: "key-12345678" });
    expect(requestKeyFrom(request(), { requestKey: "body-key-1" })).toEqual({ key: "body-key-1" });
    expect(requestKeyFrom(request(), {})).toEqual({});
  });

  it("refuses a malformed key rather than ignoring it", () => {
    expect(requestKeyFrom(request("short"), {}).error).toMatch(/8 to 128/);
    expect(requestKeyFrom(request("has spaces in it"), {}).error).toMatch(/8 to 128/);
  });
});
