import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "@/app/api/evaluations/route";

const mocks = vi.hoisted(() => ({
  annotationPath: vi.fn(() => "outputs/.evaluations/annotations.json"),
  list: vi.fn(),
  update: vi.fn()
}));

vi.mock("@/lib/generation-evaluation-server", () => ({
  evaluationAnnotationPath: mocks.annotationPath,
  listGenerationEvaluations: mocks.list,
  updateGenerationEvaluation: mocks.update
}));

const record = {
  schemaVersion: "bfl-evaluation/v1",
  id: "job-1",
  title: "Fox",
  annotation: { verdict: "unreviewed", tags: [], notes: "" }
};

describe("evaluations route", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes filters to the normalized evaluation store", async () => {
    mocks.list.mockResolvedValue([record]);
    const response = await GET(new NextRequest("http://localhost/api/evaluations?mediaType=video&limit=20"));
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ mediaType: "video", limit: 20 }));
    await expect(response.json()).resolves.toMatchObject({ count: 1, records: [{ id: "job-1" }] });
  });

  it("emits JSONL for agent pipelines", async () => {
    mocks.list.mockResolvedValue([record]);
    const response = await GET(new NextRequest("http://localhost/api/evaluations?format=jsonl"));
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    expect(await response.text()).toBe(`${JSON.stringify(record)}\n`);
  });

  it("updates one evaluation annotation by id", async () => {
    mocks.update.mockResolvedValue({ ...record, annotation: { verdict: "keep", rating: 5, tags: [], notes: "" } });
    const response = await PATCH(new NextRequest("http://localhost/api/evaluations?id=job-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating: 5, verdict: "keep" })
    }));
    expect(mocks.update).toHaveBeenCalledWith("job-1", { rating: 5, verdict: "keep" });
    await expect(response.json()).resolves.toMatchObject({ ok: true, record: { id: "job-1" } });
  });
});
