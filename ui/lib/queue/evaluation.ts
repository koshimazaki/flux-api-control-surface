import {
  DEFAULT_EVALUATION_ANNOTATION,
  approximatePromptTokens,
  type GenerationEvaluationAnnotation,
  type GenerationEvaluationRecord
} from "@/lib/generation-evaluation";
import { readQueueState } from "./store";
import type { ServerQueueJob } from "./types";

const UNSUCCESSFUL = new Set<ServerQueueJob["status"]>(["failed", "cancelled"]);

function evaluationRecordFor(
  job: ServerQueueJob,
  annotations: Record<string, GenerationEvaluationAnnotation>
): GenerationEvaluationRecord {
  const id = job.providerRequestId || job.id;
  return {
    schemaVersion: "bfl-evaluation/v1",
    id,
    title: job.title || job.id,
    createdAt: new Date(job.finishedAt || job.createdAt).toISOString(),
    mediaType: job.kind === "video" ? "video" : "image",
    provider: "bfl-api",
    model: job.model || (job.kind === "video" ? "flux-3-video" : "bfl-api"),
    endpoint: job.model || job.operation,
    operation: job.operation,
    status: job.status === "cancelled" ? "cancelled" : "failed",
    failureClass: job.failureClass,
    prompt: { text: "", approximateTokens: approximatePromptTokens(""), sourceIds: [] },
    settings: {},
    cost: {
      submittedCredits: job.estimatedCredits,
      chargedCredits: job.actualCredits,
      creditsBefore: job.creditsBefore,
      creditsAfter: job.creditsAfter
    },
    providerRequest: { id, pollingUrl: job.pollingUrl },
    sources: { assetIds: job.sourceAssetIds || [], collectionIds: [], keyframes: [] },
    provenance: { batchId: job.batchId, rowIndex: job.batchIndex },
    queue: {
      jobId: job.id,
      queueWaitMs: job.queueWaitMs,
      retryCount: job.retryCount,
      attempts: job.attempts,
      recovery: job.recovery
    },
    output: { previewUrl: "", metadataPath: "" },
    error: job.error,
    annotation: annotations[id] || { ...DEFAULT_EVALUATION_ANNOTATION }
  };
}

/**
 * Failed and cancelled attempts have no saved artifact to scan, so the queue
 * store itself supplies them to the one `bfl-evaluation/v1` read model instead
 * of a second run-history store being introduced.
 */
export async function unsuccessfulQueueEvaluations(annotations: Record<string, GenerationEvaluationAnnotation>) {
  try {
    const state = await readQueueState();
    return state.jobs.filter((job) => UNSUCCESSFUL.has(job.status)).map((job) => evaluationRecordFor(job, annotations));
  } catch {
    return [];
  }
}
