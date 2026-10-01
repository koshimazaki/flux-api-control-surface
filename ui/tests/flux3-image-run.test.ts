import { describe, expect, it, vi } from "vitest";
import { followFlux3ImageJob, loadFlux3ImageOutput, submitFlux3ImageRun } from "@/lib/dashboard/use-flux3-image-run";

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

  it("stops quietly when the page stops following", async () => {
    const signal = { cancelled: false };
    const fetcher = vi.fn(async () => {
      signal.cancelled = true;
      return json({ job: { status: "running" } });
    });
    await expect(followFlux3ImageJob("job-7", { fetcher, intervalMs: 0, signal })).resolves.toBeNull();
  });

  it("says so when a finished job's output is not listed yet", async () => {
    const fetcher = vi.fn(async () => json([{ id: "other" }]));
    await expect(loadFlux3ImageOutput("f3i-1", fetcher)).rejects.toThrow(/not in Assets yet/);
  });
});
