import { flux3VideoAdapter } from "./flux3-video";
import type { OperationAdapter } from "./types";
import { videoUpscaleAdapter } from "./video-upscale";
import { VIDEO_UPSCALE_OPERATION } from "@/lib/video-upscale";

export const videoAdapter: OperationAdapter = {
  kind: "video",
  prepare(body, origin) {
    return body.operation === VIDEO_UPSCALE_OPERATION
      ? videoUpscaleAdapter.prepare(body, origin)
      : flux3VideoAdapter.prepare(body, origin);
  },
  finalize(input) {
    return input.prepared.operation === VIDEO_UPSCALE_OPERATION
      ? videoUpscaleAdapter.finalize(input)
      : flux3VideoAdapter.finalize(input);
  },
  deliveryUrl(result) {
    // Both documented video endpoints expose result.sample.
    const sampleUrl = result.result?.sample;
    return typeof sampleUrl === "string" && sampleUrl
      ? { url: sampleUrl }
      : { error: "BFL result did not include a video URL." };
  }
};
