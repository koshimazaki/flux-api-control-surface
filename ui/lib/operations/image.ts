import { FLUX3_IMAGE_OPERATION, flux3ImageAdapter } from "./flux3-image";
import { imageGenerateAdapter } from "./image-generate";
import type { OperationAdapter } from "./types";

/** The image lane: FLUX 3 Image by its operation tag, every other request through FLUX.2 generation. */
export const imageAdapter: OperationAdapter = {
  kind: "image",
  prepare(body, origin) {
    return body.operation === FLUX3_IMAGE_OPERATION
      ? flux3ImageAdapter.prepare(body, origin)
      : imageGenerateAdapter.prepare(body, origin);
  },
  finalize(input) {
    return input.prepared.operation === FLUX3_IMAGE_OPERATION
      ? flux3ImageAdapter.finalize(input)
      : imageGenerateAdapter.finalize(input);
  },
  // Both endpoints deliver result.sample.
  deliveryUrl: imageGenerateAdapter.deliveryUrl
};
