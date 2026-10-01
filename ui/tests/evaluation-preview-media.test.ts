import { rm } from "node:fs/promises";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_EVALUATION_ANNOTATION,
  evaluationPreviewMedia,
  type GenerationEvaluationRecord
} from "@/lib/generation-evaluation";
import { unsuccessfulQueueEvaluations } from "@/lib/queue/evaluation";
import { queueDir } from "@/lib/queue/paths";
import { mutateQueueState } from "@/lib/queue/store";
import type { ServerQueueJob } from "@/lib/queue/types";

function record(overrides: Partial<GenerationEvaluationRecord> = {}): GenerationEvaluationRecord {
  return {
    schemaVersion: "bfl-evaluation/v1",
    id: "gen-1",
    title: "a clip",
    createdAt: "2026-09-12T00:00:00.000Z",
    mediaType: "video",
    provider: "bfl-api",
    model: "flux-3-video",
    endpoint: "flux-3-video",
    operation: "t2v",
    status: "complete",
    prompt: { text: "", approximateTokens: 0, sourceIds: [] },
    settings: {},
    cost: {},
    providerRequest: { id: "gen-1" },
    sources: { assetIds: [], collectionIds: [], keyframes: [] },
    provenance: {},
    output: { previewUrl: "/api/bfl/flux3-video/gen-1", metadataPath: "outputs/gen-1.json" },
    annotation: { ...DEFAULT_EVALUATION_ANNOTATION },
    ...overrides
  } as GenerationEvaluationRecord;
}

beforeEach(async () => {
  await rm(queueDir(), { recursive: true, force: true });
});

describe("Evaluate card preview media", () => {
  it("plays a saved video and shows a saved image from their own routes", () => {
    expect(evaluationPreviewMedia(record())).toEqual({
      kind: "video",
      src: "/api/bfl/flux3-video/gen-1"
    });
    expect(
      evaluationPreviewMedia(
        record({ mediaType: "image", output: { previewUrl: "/api/outputs/gen-1/image", metadataPath: "x.json" } })
      )
    ).toEqual({ kind: "image", src: "/api/outputs/gen-1/image" });
  });

  it("never yields a media element without a source", () => {
    // An empty src makes the browser re-request the whole page, so a record
    // with no saved output must resolve to the empty state instead.
    for (const previewUrl of ["", "   "]) {
      const media = evaluationPreviewMedia(record({ output: { previewUrl, metadataPath: "" } }));
      expect(media.kind).toBe("empty");
      expect(media).not.toHaveProperty("src");
    }
  });

  it("explains a failed attempt with its own error, and names a cancellation", () => {
    expect(
      evaluationPreviewMedia(
        record({
          status: "failed",
          error: "FLUX Video Edit failed: Content Moderated",
          output: { previewUrl: "", metadataPath: "" }
        })
      )
    ).toEqual({
      kind: "empty",
      heading: "No output saved",
      detail: "FLUX Video Edit failed: Content Moderated"
    });

    expect(
      evaluationPreviewMedia(record({ status: "cancelled", output: { previewUrl: "", metadataPath: "" } }))
    ).toEqual({
      kind: "empty",
      heading: "Cancelled",
      detail: "This video attempt never produced a file."
    });
  });

  it("keeps a real failed video job out of the media element", async () => {
    // The regression came from a failed video-edit job: /api/evaluations folds
    // unsuccessful queue attempts in, and they carry no preview URL.
    await mutateQueueState((state) => {
      state.jobs.push({
        id: "job-edit-failed",
        kind: "video",
        lane: "video",
        operation: "video-edit",
        title: "FLUX Video Edit",
        model: "flux-tools-video-edit-v1",
        status: "failed",
        createdAt: 1_000,
        queuedAt: 1_000,
        error: "The queued request payload is no longer available on this server."
      } as ServerQueueJob);
    });

    const [failed] = await unsuccessfulQueueEvaluations({});
    expect(failed.mediaType).toBe("video");
    expect(failed.output.previewUrl).toBe("");
    expect(evaluationPreviewMedia(failed)).toEqual({
      kind: "empty",
      heading: "No output saved",
      detail: "The queued request payload is no longer available on this server."
    });
  });
});
