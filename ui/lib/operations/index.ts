import type { GenerationJobKind } from "@/lib/generation-queue";
import { videoAdapter } from "./video";
import { imageAdapter } from "./image";
import { imageToolAdapter } from "./image-tool";
import type { OperationAdapter } from "./types";

const adapters: Record<GenerationJobKind, OperationAdapter> = {
  image: imageAdapter,
  tool: imageToolAdapter,
  video: videoAdapter
};

export function operationAdapter(kind: GenerationJobKind) {
  return adapters[kind];
}

export { isOperationFailure } from "./types";
export type {
  OperationAdapter,
  OperationFailure,
  OperationFinalizeInput,
  OperationFinalizeOutcome,
  OperationTimingMarks,
  PreparedOperation
} from "./types";
