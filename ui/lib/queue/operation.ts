import { FLUX3_IMAGE_OPERATION } from "@/lib/flux3-image";
import type { GenerationJobKind } from "@/lib/generation-queue";
import { VIDEO_EDIT_OPERATION } from "@/lib/video-edit";
import { VIDEO_UPSCALE_OPERATION } from "@/lib/video-upscale";

/**
 * Products that share a lane with another one. The lane's adapter picks them
 * by the request body's `operation` tag; anything else in the lane is its
 * default product (FLUX.2 generation, FLUX 3 video).
 */
const NAMED_OPERATIONS: Record<GenerationJobKind, readonly string[]> = {
  image: [FLUX3_IMAGE_OPERATION],
  tool: [],
  video: [VIDEO_UPSCALE_OPERATION, VIDEO_EDIT_OPERATION]
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * The operation a queue request names: given with the job, tagged in its
 * payload, or implied by the lane (the tool, the video mode, FLUX.2 generation).
 */
export function requestedOperation(kind: GenerationJobKind, body: Record<string, unknown>, explicit?: unknown) {
  if (text(explicit)) return text(explicit);
  if (kind === "tool") return text(body.tool);
  if (text(body.operation)) return text(body.operation);
  return kind === "video" ? text(body.mode) : "generate";
}

/**
 * Makes a job's operation and its body's tag name the same product. The job's
 * operation decides the label, the estimate and the poll budget; the body's tag
 * decides which adapter runs. Left to disagree, a job is priced as one product
 * and sent to another.
 */
export function reconcileOperation<T extends { kind: GenerationJobKind; operation: string; body: Record<string, unknown> }>(
  input: T
): T {
  const product = [input.operation, input.body.operation].find(
    (name): name is string => typeof name === "string" && NAMED_OPERATIONS[input.kind].includes(name)
  );
  if (!product || (input.operation === product && input.body.operation === product)) return input;
  return { ...input, operation: product, body: { ...input.body, operation: product } };
}
