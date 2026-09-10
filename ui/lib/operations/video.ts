import { flux3VideoAdapter } from "./flux3-video";
import type { OperationAdapter } from "./types";
import { videoEditAdapter } from "./video-edit";
import { videoUpscaleAdapter } from "./video-upscale";
import { VIDEO_EDIT_OPERATION } from "@/lib/video-edit";
import { VIDEO_UPSCALE_OPERATION } from "@/lib/video-upscale";

/** The video lane carries three FLUX products; the body's operation picks the adapter. */
function adapterFor(operation: unknown): OperationAdapter {
  if (operation === VIDEO_UPSCALE_OPERATION) return videoUpscaleAdapter;
  if (operation === VIDEO_EDIT_OPERATION) return videoEditAdapter;
  return flux3VideoAdapter;
}

export const videoAdapter: OperationAdapter = {
  kind: "video",
  prepare(body, origin) {
    return adapterFor(body.operation).prepare(body, origin);
  },
  finalize(input) {
    return adapterFor(input.prepared.operation).finalize(input);
  },
  deliveryUrl(result) {
    // Every documented video endpoint exposes result.sample.
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include a video URL." };
  }
};
