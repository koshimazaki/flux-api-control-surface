import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/dashboard/video-script-plan/route";

function planRequest(body: unknown) {
  return new NextRequest("http://localhost/api/dashboard/video-script-plan", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("POST /api/dashboard/video-script-plan", () => {
  it("plans a sequence batch from inline pools and prompts into queue-ready jobs", async () => {
    const response = await POST(
      planRequest({
        pools: [{ id: "p1", assetIds: ["a1", "a2", "a3"] }],
        generator: { workflow: "sequence", poolId: "p1", slotCount: 2, mode: "combination" },
        prompts: [{ text: "Image 1 morphs into image 2, studio lighting." }],
        settings: { duration: 8 },
        hardCap: 10,
        batchId: "vsb_test"
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.preview.cappedRowCount).toBeGreaterThan(0);
    expect(data.blocked).toEqual([]);
    expect(data.jobs.length).toBe(data.preview.cappedRowCount);
    expect(data.jobs[0]).toMatchObject({ kind: "video", batchId: "vsb_test", batchTotal: data.jobs.length });
    expect(data.enqueueWith).toMatchObject({ route: "/api/dashboard/queue", mcpTool: "enqueue_generation_jobs" });
    expect(JSON.stringify(data.jobs)).not.toContain("data:image");
  });

  it("holds back rows whose prompt still carries an unfilled blank", async () => {
    const response = await POST(
      planRequest({
        pools: [{ id: "p1", assetIds: ["a1", "a2"] }],
        generator: { workflow: "sequence", poolId: "p1", slotCount: 2, mode: "combination" },
        prompts: [{ text: "Animate image 1 in {style}." }],
        settings: { duration: 8 }
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.blocked.length).toBeGreaterThan(0);
    expect(data.jobs).toEqual([]);
  });

  it("resolves pools from a saved Collection and prompts from the library", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/collections")) {
        return new Response(
          JSON.stringify([
            { id: "col_1", name: "Anchors", members: [{ assetId: "c1" }, { assetId: "c2" }] }
          ]),
          { status: 200 }
        );
      }
      if (url.includes("/api/prompts")) {
        return new Response(
          JSON.stringify({ prompts: [{ id: "vp_1", prompt: "Image 1 settles into image 2." }] }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const response = await POST(
      planRequest({
        pools: [{ collectionId: "col_1" }],
        generator: { workflow: "sequence", poolId: "col_1", slotCount: 2, mode: "combination" },
        promptIds: ["vp_1"],
        settings: { duration: 8 }
      })
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.jobs.length).toBeGreaterThan(0);
    expect(data.rows[0].compiledPrompt).toContain("settles into");
  });

  it("names a missing collection instead of planning an empty batch", async () => {
    globalThis.fetch = vi.fn(async () => new Response("[]", { status: 200 })) as typeof fetch;
    const response = await POST(
      planRequest({
        pools: [{ collectionId: "col_missing" }],
        generator: { workflow: "sequence", poolId: "col_missing", slotCount: 2, mode: "combination" },
        prompts: [{ text: "Image 1 to image 2." }]
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("col_missing");
  });
});
