import type {
  GenerationJobKind,
  GenerationLane,
  GenerationLaneLimits,
  GenerationQueueJob
} from "@/lib/generation-queue";

export type GenerationFailureClass = "retryable" | "terminal" | "moderated" | "credits" | "auth";

export type QueueJobAttempt = {
  attempt: number;
  startedAt: number;
  endedAt?: number;
  status: "complete" | "failed";
  failureClass?: GenerationFailureClass;
  error?: string;
  providerRequestId?: string;
  phase?: "submit" | "poll" | "finalize";
  durations?: {
    submitMs?: number;
    providerMs?: number;
    downloadMs?: number;
    finalizeMs?: number;
    creditsMs?: number;
  };
};

export type QueueRecoveryEventKind =
  | "restart-resume"
  | "restart-abandoned"
  | "lease-acquired"
  | "lease-takeover"
  | "manual-poll"
  | "manual-finalize"
  | "retry-scheduled";

export type QueueRecoveryEvent = {
  at: number;
  event: QueueRecoveryEventKind;
  detail?: string;
};

export type QueueJobResult = {
  mediaType?: "image" | "video";
  assetId?: string;
  localPath?: string;
  metadataPath?: string;
};

/**
 * The compact, persisted job record. It is what queue lists, manifests, and MCP
 * responses expose, so it never carries API keys, base64 media, or an expiring
 * delivery URL as the only copy of an output.
 */
export type ServerQueueJob = GenerationQueueJob & {
  queuedAt: number;
  /** Provider model or endpoint label, surfaced in queue lists and the run log. */
  model?: string;
  /** Submit-time provider cost, persisted so cost reconciliation survives a restart. */
  submittedCost?: number;
  submittedAt?: number;
  /** Resets the provider poll budget when a Retry resumes an accepted job. */
  pollBudgetStartedAt?: number;
  nextPollAt?: number;
  pollCount?: number;
  failureClass?: GenerationFailureClass;
  sourceAssetIds?: string[];
  sourceFingerprint?: string;
  actualCredits?: number;
  actualUsd?: number;
  creditsBefore?: number;
  creditsAfter?: number;
  queueWaitMs?: number;
  maxRetries?: number;
  payloadRecoverable?: boolean;
  attempts?: QueueJobAttempt[];
  recovery?: QueueRecoveryEvent[];
  result?: QueueJobResult;
};

/**
 * The sanitized execution descriptor. Stored apart from the compact record so a
 * queue listing can never leak a request body, and re-derived into a provider
 * payload at submit time by the operation adapters.
 */
export type QueueJobDescriptor = {
  jobId: string;
  kind: GenerationJobKind;
  operation: string;
  origin?: string;
  /** Sanitized request body: no apiKey, no base64/data-URL media. */
  body: Record<string, unknown>;
  /** True when sanitization removed nothing, so the body can be replayed after a restart. */
  recoverable: boolean;
  redactedKeys?: string[];
};

export type QueueSettings = {
  globalLimit: number;
  laneLimits: GenerationLaneLimits;
};

export type QueueBreakerState = {
  failures: number;
  openUntil?: number;
};

export type QueueQuarantineEntry = {
  fingerprint: string;
  failures: number;
  quarantinedAt: number;
  reason: string;
};

export type QueueStoreState = {
  version: 1;
  /** Monotonic write counter used to detect and reject a stale cross-process write. */
  revision: number;
  updatedAt: number;
  paused: boolean;
  pauseReason?: string;
  pausedAt?: number;
  settings: QueueSettings;
  jobs: ServerQueueJob[];
  descriptors: Record<string, QueueJobDescriptor>;
  breakers: Partial<Record<GenerationLane, QueueBreakerState>>;
  quarantine: QueueQuarantineEntry[];
};

export type RunnerLease = {
  owner: string;
  acquiredAt: number;
  renewedAt: number;
  expiresAt: number;
};

export type EnqueueJobInput = {
  kind: GenerationJobKind;
  operation: string;
  title?: string;
  body: Record<string, unknown>;
  origin?: string;
  priority?: number;
  dependsOn?: string[];
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  estimatedCredits?: number;
  estimatedUsd?: number;
  sourceAssetIds?: string[];
  promptTokens?: number;
};

export const QUEUE_LANE_BY_KIND: Record<GenerationJobKind, GenerationLane> = {
  image: "image",
  tool: "tool",
  video: "video"
};
