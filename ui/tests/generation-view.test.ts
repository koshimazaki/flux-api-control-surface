import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { generationJobMatchesWorkspace, pendingGenerationJobs } from "@/lib/generation-view";
import { GalleryGenerationCard } from "@/components/generation/gallery-generation-card";
import { Flux3ImageResult } from "@/components/flux3-image-result";
import type { GenerationQueueJob, GenerationQueueStatus } from "@/lib/generation-queue";
import type { AssetRecord } from "@/lib/types";

const job = (kind: GenerationQueueJob["kind"], operation: string, status: GenerationQueueStatus = "running"): GenerationQueueJob => ({
  id: `${kind}-${operation}`, kind, lane: kind, operation, status, title: `Make ${operation}`, createdAt: 1
});

describe("shared generation waiting views", () => {
  it("keeps every pending phase visible and drops terminal jobs", () => {
    const statuses: GenerationQueueStatus[] = ["queued", "waiting", "paused", "submitting", "running", "downloading", "complete", "failed", "cancelled"];
    expect(pendingGenerationJobs(statuses.map((status) => job("image", status, status))).map((j) => j.status))
      .toEqual(statuses.slice(0, 6));
  });

  it("shows the matching generator's job, without lighting unrelated workspaces", () => {
    const cases = [
      [job("image", "generate"), "prompt"], [job("image", "flux3-image"), "flux3_image"],
      [job("video", "t2v"), "flux3"], [job("video", "i2v"), "flux3"], [job("video", "v2v"), "flux3"],
      [job("video", "draft_enhance"), "flux3"], [job("video", "video-edit"), "edit"], [job("video", "video-upscale"), "upscale"],
      ...["erase", "outpaint", "deblur", "vto"].map((mode) => [job("tool", mode), mode] as const)
    ] as const;
    for (const [entry, workspace] of cases) {
      expect(generationJobMatchesWorkspace(entry, workspace)).toBe(true);
      expect(generationJobMatchesWorkspace(entry, workspace === "flux3_image" ? "prompt" : "flux3_image")).toBe(false);
    }
  });

  it("reserves a reveal overlay in image, tool and video gallery cards", () => {
    const jobs = [job("image", "generate"), job("tool", "erase"), job("video", "t2v")];
    const html = renderToStaticMarkup(createElement("div", null, jobs.map((entry) => createElement(GalleryGenerationCard, {
      key: entry.id, generation: { job: entry }, aspectRatio: "16:9", onRevealed: () => {}
    }))));
    expect(html.match(/class="generationOverlay"/g)).toHaveLength(3);
    expect(html).not.toContain('class="spin"');
  });

  it("shows the image field on a second run even with a previous result", () => {
    const result = { id: "previous", title: "Previous image", imageDataUrl: "/previous.png" } as AssetRecord;
    const props = { running: true, run: { result, count: 1, status: "running", startedAt: 1, watching: true }, onOpen: () => {}, onEdit: () => {}, onDismiss: () => {} };
    const html = renderToStaticMarkup(createElement(Flux3ImageResult, props));
    expect(html).toContain('class="waitField"');
    expect(html).toContain('class="flux3ImageResult waiting"');
    const finished = renderToStaticMarkup(createElement(Flux3ImageResult, { ...props, running: false }));
    expect(finished).not.toContain('class="waitField"');
  });
});
