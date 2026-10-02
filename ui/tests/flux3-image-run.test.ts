import { describe, expect, it, vi } from "vitest";
import {
  Flux3ImageJobError,
  followFlux3ImageJob,
  loadFlux3ImageOutput,
  normalizePendingRuns,
  submitFlux3ImageRun
} from "@/lib/dashboard/use-flux3-image-run";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const savedOutput = { id: "f3i-1", title: "fox", imageUrl: "/api/outputs/f3i-1/image", runSettings: { flux3Image: { mode: "t2i" } } };

/** A fetcher that answers the queue with each status in turn, then serves the saved output. */
function queueFetcher(statuses: Array<Record<string, unknown> | Error>) {
  const queue = [...statuses];
  return vi.fn(async (url: string) => {
    if (url.startsWith("/api/dashboard/queue")) {
      const next = queue.length > 1 ? queue.shift()! : queue[0];
      if (next instanceof Error) throw next;
      return json({ job: next });
    }
    if (url.startsWith("/api/outputs?")) return json([{ id: "older" }, savedOutput]);
    if (url === "/api/outputs/f3i-1/image") return new Response(new Blob(["png"], { type: "image/png" }));
    return json({ error: "unexpected" }, 500);
  });
}

describe("FLUX 3 Image runs follow the queue instead of holding the request open", () => {
  it("queues without waiting and returns the job id", async () => {
    const fetcher = vi.fn(async () => json({ queued: true, jobId: "job-7" }, 202));
    await expect(submitFlux3ImageRun({ mode: "t2i", prompt: "fox" }, fetcher)).resolves.toBe("job-7");
    expect(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toMatchObject({ prompt: "fox", wait: false });
    await expect(submitFlux3ImageRun({}, vi.fn(async () => json({ error: "FLUX API key is required." }, 400)))).rejects.toThrow(
      "FLUX API key is required."
    );
  });

  it("keeps following a slow job past dropped polls, then loads its output as a reload would", async () => {
    const fetcher = queueFetcher([{ status: "queued" }, new TypeError("fetch failed"), { status: "running" }, { status: "complete", resultAssetId: "f3i-1" }]);
    const asset = await followFlux3ImageJob("job-7", { fetcher, intervalMs: 0 });
    expect(asset).toMatchObject({ id: "f3i-1", runSettings: { flux3Image: { mode: "t2i" } } });
    expect(asset?.imageDataUrl).toBe(`data:image/png;base64,${Buffer.from("png").toString("base64")}`);
    expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith("/api/dashboard/queue")).length).toBe(4);
  });

  it("reports the queue's own failure, and a job the queue no longer has", async () => {
    await expect(followFlux3ImageJob("job-7", { fetcher: queueFetcher([{ status: "failed", error: "Content Moderated" }]), intervalMs: 0 })).rejects.toThrow(
      "Content Moderated"
    );
    const gone = vi.fn(async () => json({ error: "not found" }, 404));
    await expect(followFlux3ImageJob("job-7", { fetcher: gone, intervalMs: 0 })).rejects.toThrow(/no longer on the server queue/);
  });

  it("tells a cancelled job from a failed one, and reports each status on the way", async () => {
    const cancelled = await followFlux3ImageJob("job-7", { fetcher: queueFetcher([{ status: "cancelled" }]), intervalMs: 0 }).catch((error) => error);
    expect(cancelled).toBeInstanceOf(Flux3ImageJobError);
    expect(cancelled).toMatchObject({ cancelled: true, message: "The FLUX 3 Image job was cancelled." });
    const failed = await followFlux3ImageJob("job-7", { fetcher: queueFetcher([{ status: "failed" }]), intervalMs: 0 }).catch((error) => error);
    expect(failed).toMatchObject({ cancelled: false, message: "The FLUX 3 Image job failed." });

    const seen: string[] = [];
    const fetcher = queueFetcher([{ status: "queued" }, { status: "running" }, { status: "complete", resultAssetId: "f3i-1" }]);
    await followFlux3ImageJob("job-7", { fetcher, intervalMs: 0, onStatus: (status) => seen.push(status) });
    expect(seen).toEqual(["queued", "running", "complete"]);
  });

  it("reads stored runs as a list, including the single run saved before runs could stack", () => {
    const run = { jobId: "job-7", title: "fox", prompt: "fox", startedAt: 1 };
    expect(normalizePendingRuns([run, { jobId: "job-8", title: "hat", prompt: "", startedAt: 2 }]).map((item) => item.jobId)).toEqual(["job-7", "job-8"]);
    expect(normalizePendingRuns(run)).toEqual([run]);
    expect(normalizePendingRuns([null, { title: "no id" }, "text"])).toEqual([]);
    expect(normalizePendingRuns(null)).toEqual([]);
  });

  it("stops quietly when the page stops following", async () => {
    const signal = { cancelled: false };
    const fetcher = vi.fn(async () => {
      signal.cancelled = true;
      return json({ job: { status: "running" } });
    });
    await expect(followFlux3ImageJob("job-7", { fetcher, intervalMs: 0, signal })).resolves.toBeNull();
  });

  it("finds an output that newer ones have pushed off the first page", async () => {
    const newer = (page: number) => Array.from({ length: 60 }, (_, index) => ({ id: `newer-${page}-${index}` }));
    const fetcher = vi.fn(async (url: string) => {
      if (url === "/api/outputs/f3i-1/image") return new Response(new Blob(["png"], { type: "image/png" }));
      const offset = Number(new URL(url, "http://localhost").searchParams.get("offset"));
      // Two full pages of newer outputs, then the page that holds it.
      return json(offset < 120 ? newer(offset / 60) : [{ id: "older" }, savedOutput]);
    });
    await expect(loadFlux3ImageOutput("f3i-1", fetcher)).resolves.toMatchObject({ id: "f3i-1" });
    expect(fetcher.mock.calls.map(([url]) => url).filter((url) => String(url).startsWith("/api/outputs?"))).toEqual([
      "/api/outputs?limit=60&offset=0",
      "/api/outputs?limit=60&offset=60",
      "/api/outputs?limit=60&offset=120"
    ]);
  });

  it("asks again when a finished job's output cannot be read for now, and ends the run when it is refused", async () => {
    // The list answers 503 once and the image 503 once; the job is polled again each time and nothing is resubmitted.
    const failures = { list: 1, image: 1 };
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith("/api/dashboard/queue")) return json({ job: { status: "complete", resultAssetId: "f3i-1" } });
      if (url.startsWith("/api/outputs?")) return failures.list-- > 0 ? json({ error: "busy" }, 503) : json([savedOutput]);
      return failures.image-- > 0 ? new Response("busy", { status: 503 }) : new Response(new Blob(["png"], { type: "image/png" }));
    });
    await expect(followFlux3ImageJob("job-7", { fetcher, intervalMs: 0 })).resolves.toMatchObject({ id: "f3i-1" });
    // Only the queue and the outputs are read again; the generation route is never called.
    expect(fetcher.mock.calls.some(([url]) => url.startsWith("/api/bfl/"))).toBe(false);

    const refused = vi.fn(async (url: string) => (url.startsWith("/api/outputs?") ? json([savedOutput]) : new Response("gone", { status: 404 })));
    await expect(loadFlux3ImageOutput("f3i-1", refused)).rejects.toThrow(/its image f3i-1 could not be read \(HTTP 404\)/);
    await expect(loadFlux3ImageOutput("f3i-1", refused)).rejects.toBeInstanceOf(Flux3ImageJobError);
  });

  it("says so when a finished job's output is not listed yet", async () => {
    const fetcher = vi.fn(async () => json([{ id: "other" }]));
    await expect(loadFlux3ImageOutput("f3i-1", fetcher)).rejects.toThrow(/not in Assets yet/);
  });
});
