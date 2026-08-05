// The live browser image runner still uses its historical concurrency until the
// server-owned queue replaces it. Keep that behavior stable during migration.
export const GENERATION_QUEUE_CONCURRENCY = 10;
export const DEFAULT_GLOBAL_GENERATION_CONCURRENCY = 4;

export type GenerationJobKind = "image" | "tool" | "video";
export type GenerationLane = GenerationJobKind;
export type GenerationQueueStatus =
  | "queued"
  | "waiting"
  | "paused"
  | "submitting"
  | "running"
  | "downloading"
  | "complete"
  | "failed"
  | "cancelled";

export type GenerationLaneLimits = Record<GenerationLane, number>;

export const DEFAULT_GENERATION_LANE_LIMITS: GenerationLaneLimits = {
  image: 4,
  tool: 2,
  video: 2
};

export type GenerationQueueJob = {
  id: string;
  kind: GenerationJobKind;
  lane: GenerationLane;
  operation: string;
  title: string;
  status: GenerationQueueStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  priority?: number;
  dependsOn?: string[];
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  promptTokens?: number;
  estimatedCredits?: number;
  estimatedUsd?: number;
  providerRequestId?: string;
  pollingUrl?: string;
  resultAssetId?: string;
  retryCount?: number;
  nextRetryAt?: number;
  error?: string;
};

export type GenerationQueueSummary = {
  total: number;
  queued: number;
  waiting: number;
  paused: number;
  submitting: number;
  running: number;
  downloading: number;
  complete: number;
  failed: number;
  cancelled: number;
  active: number;
  inFlight: number;
};

export type GenerationDependencyState = {
  state: "ready" | "waiting" | "blocked";
  dependencyIds: string[];
  reason?: string;
};

export type GenerationSchedulerOptions = {
  globalLimit?: number;
  laneLimits?: Partial<GenerationLaneLimits>;
  now?: number;
};

const ACTIVE_STATUSES = new Set<GenerationQueueStatus>([
  "queued",
  "waiting",
  "submitting",
  "running",
  "downloading"
]);
const IN_FLIGHT_STATUSES = new Set<GenerationQueueStatus>(["submitting", "running", "downloading"]);
const RUNNABLE_STATUSES = new Set<GenerationQueueStatus>(["queued", "waiting"]);
const BLOCKING_DEPENDENCY_STATUSES = new Set<GenerationQueueStatus>(["failed", "cancelled"]);

export function summarizeGenerationQueue(jobs: GenerationQueueJob[]): GenerationQueueSummary {
  return jobs.reduce<GenerationQueueSummary>(
    (summary, job) => {
      summary.total += 1;
      summary[job.status] += 1;
      if (ACTIVE_STATUSES.has(job.status)) summary.active += 1;
      if (IN_FLIGHT_STATUSES.has(job.status)) summary.inFlight += 1;
      return summary;
    },
    {
      total: 0,
      queued: 0,
      waiting: 0,
      paused: 0,
      submitting: 0,
      running: 0,
      downloading: 0,
      complete: 0,
      failed: 0,
      cancelled: 0,
      active: 0,
      inFlight: 0
    }
  );
}

export function availableGenerationSlots(running: number, limit = GENERATION_QUEUE_CONCURRENCY) {
  return Math.max(0, limit - Math.max(0, running));
}

export function generationDependencyState(
  job: GenerationQueueJob,
  jobs: GenerationQueueJob[]
): GenerationDependencyState {
  const dependencyIds = Array.from(new Set(job.dependsOn || [])).filter((id) => id && id !== job.id);
  if (!dependencyIds.length) return { state: "ready", dependencyIds };

  const jobsById = new Map(jobs.map((candidate) => [candidate.id, candidate]));
  const missing = dependencyIds.filter((id) => !jobsById.has(id));
  if (missing.length) {
    return {
      state: "blocked",
      dependencyIds,
      reason: `Missing dependenc${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")}`
    };
  }

  const blocked = dependencyIds
    .map((id) => jobsById.get(id)!)
    .filter((dependency) => BLOCKING_DEPENDENCY_STATUSES.has(dependency.status));
  if (blocked.length) {
    return {
      state: "blocked",
      dependencyIds,
      reason: `Dependency did not complete: ${blocked.map((dependency) => dependency.title).join(", ")}`
    };
  }

  const missingResults = dependencyIds
    .map((id) => jobsById.get(id)!)
    .filter((dependency) => dependency.status === "complete" && !dependency.resultAssetId);
  if (missingResults.length) {
    return {
      state: "blocked",
      dependencyIds,
      reason: `Dependency has no saved output: ${missingResults.map((dependency) => dependency.title).join(", ")}`
    };
  }

  const waiting = dependencyIds
    .map((id) => jobsById.get(id)!)
    .filter((dependency) => dependency.status !== "complete");
  if (waiting.length) {
    return {
      state: "waiting",
      dependencyIds,
      reason: `Waiting for ${waiting.map((dependency) => dependency.title).join(", ")}`
    };
  }

  return { state: "ready", dependencyIds };
}

export function selectRunnableGenerationJobs(
  jobs: GenerationQueueJob[],
  options: GenerationSchedulerOptions = {}
) {
  const globalLimit = Math.max(1, Math.floor(options.globalLimit || DEFAULT_GLOBAL_GENERATION_CONCURRENCY));
  const laneLimits: GenerationLaneLimits = {
    ...DEFAULT_GENERATION_LANE_LIMITS,
    ...options.laneLimits
  };
  const now = options.now ?? Date.now();
  const inFlight = jobs.filter((job) => IN_FLIGHT_STATUSES.has(job.status));
  const availableGlobalSlots = availableGenerationSlots(inFlight.length, globalLimit);
  if (!availableGlobalSlots) return [];

  const activeByLane: GenerationLaneLimits = { image: 0, tool: 0, video: 0 };
  inFlight.forEach((job) => {
    activeByLane[job.lane] += 1;
  });

  const selected: GenerationQueueJob[] = [];
  const candidates = jobs
    .filter((job) => RUNNABLE_STATUSES.has(job.status))
    .filter((job) => !job.nextRetryAt || job.nextRetryAt <= now)
    .filter((job) => generationDependencyState(job, jobs).state === "ready")
    .sort((left, right) => {
      const priorityDifference = (right.priority || 0) - (left.priority || 0);
      return priorityDifference || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
    });

  for (const job of candidates) {
    if (selected.length >= availableGlobalSlots) break;
    const laneLimit = Math.max(0, Math.floor(laneLimits[job.lane]));
    if (activeByLane[job.lane] >= laneLimit) continue;
    selected.push(job);
    activeByLane[job.lane] += 1;
  }
  return selected;
}

export function generationJobKindLabel(kind: GenerationJobKind) {
  if (kind === "tool") return "Tool";
  if (kind === "video") return "Video";
  return "Image";
}

export function generationQueueStatusLabel(status: GenerationQueueStatus) {
  if (status === "submitting") return "submitting";
  if (status === "downloading") return "saving";
  if (status === "waiting") return "waiting";
  return status;
}
