import type { GenerationJobKind } from "@/lib/generation-queue";
import { flux3VideoAdapter } from "./flux3-video";
import { imageGenerateAdapter } from "./image-generate";
import { imageToolAdapter } from "./image-tool";
import type { OperationAdapter } from "./types";

const adapters: Record<GenerationJobKind, OperationAdapter> = {
  image: imageGenerateAdapter,
  tool: imageToolAdapter,
  video: flux3VideoAdapter
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
