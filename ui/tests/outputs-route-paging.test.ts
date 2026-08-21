import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetRecord } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  readLocalOutputAssets: vi.fn(),
  fetchRemoteOutputAssets: vi.fn(),
  listFlux3VideoOutputs: vi.fn(),
  listVideoUpscaleOutputs: vi.fn()
}));

vi.mock("@/lib/server-output-store", () => ({
  readLocalOutputAssets: mocks.readLocalOutputAssets,
  OUTPUT_ROOT: "/tmp/outputs"
}));

vi.mock("@/lib/remote-archive", () => ({
  fetchRemoteOutputAssets: mocks.fetchRemoteOutputAssets
}));

vi.mock("@/lib/flux3-video-server", () => ({
  listFlux3VideoOutputs: mocks.listFlux3VideoOutputs
}));

vi.mock("@/lib/video-upscale-server", () => ({
  listVideoUpscaleOutputs: mocks.listVideoUpscaleOutputs
}));

const { GET } = await import("@/app/api/outputs/route");

function imageAsset(index: number): AssetRecord {
  return {
    id: `img-${index}`,
    title: `image ${index}`,
    createdAt: new Date(index * 1000).toISOString(),
    timestamp: index * 1000,
    imageDataUrl: "",
    imageUrl: `/api/outputs/img-${index}/image`,
    image_url: "",
    sampleUrl: "",
    model: "pro-preview",
    prompt: "",
    status: "complete",
    payload: {},
    references: []
  } as AssetRecord;
}

function videoResult(index: number) {
  return {
    id: `vid-${index}`,
    title: `video ${index}`,
    prompt: "",
    mode: "t2v" as const,
    videoUrl: `/api/bfl/flux3-video/vid-${index}`,
    // Videos are the newest items, which is what made them repeat on every page.
    createdAt: new Date(100_000 + index * 1000).toISOString(),
    draft: false,
    draftCacheAvailable: false
  };
}

beforeEach(() => {
  mocks.fetchRemoteOutputAssets.mockResolvedValue([]);
  mocks.listVideoUpscaleOutputs.mockResolvedValue([]);
  mocks.listFlux3VideoOutputs.mockImplementation(async (limit: number) =>
    Array.from({ length: Math.min(limit, 3) }, (_, index) => videoResult(index))
  );
  mocks.readLocalOutputAssets.mockImplementation(async ({ limit }: { limit: number }) =>
    Array.from({ length: Math.min(limit, 40) }, (_, index) => imageAsset(40 - index))
  );
});

afterEach(() => vi.clearAllMocks());

async function page(limit: number, offset: number) {
  const response = await GET(new NextRequest(`http://localhost/api/outputs?limit=${limit}&offset=${offset}`));
  return (await response.json()) as AssetRecord[];
}

describe("/api/outputs pagination across sources", () => {
  it("does not repeat the newest videos on every page", async () => {
    const first = await page(5, 0);
    const second = await page(5, 5);

    const firstIds = first.map((asset) => asset.id);
    const secondIds = second.map((asset) => asset.id);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    // Videos sort newest, so they belong on page one only.
    expect(firstIds.filter((id) => id.startsWith("vid-"))).toHaveLength(3);
    expect(secondIds.filter((id) => id.startsWith("vid-"))).toEqual([]);
  });

  it("does not let videos displace images out of the results", async () => {
    const second = await page(5, 5);
    // Page two is entirely images, continuing where page one stopped.
    expect(second).toHaveLength(5);
    expect(second.every((asset) => asset.id.startsWith("img-"))).toBe(true);
  });

  it("asks each source for the whole span up to the requested page", async () => {
    await page(10, 20);
    expect(mocks.listFlux3VideoOutputs).toHaveBeenCalledWith(30);
    expect(mocks.listVideoUpscaleOutputs).toHaveBeenCalledWith(30);
    expect(mocks.fetchRemoteOutputAssets).toHaveBeenCalledWith(30, expect.anything());
    expect(mocks.readLocalOutputAssets).toHaveBeenCalledWith(expect.objectContaining({ limit: 30, offset: 0 }));
  });

  it("keeps the whole list globally sorted by recency", async () => {
    const first = await page(6, 0);
    const timestamps = first.map((asset) => asset.timestamp);
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });
});
