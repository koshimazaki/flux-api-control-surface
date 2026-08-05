import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_GENERATION_LANE_LIMITS,
  DEFAULT_GLOBAL_GENERATION_CONCURRENCY,
  type GenerationLane
} from "@/lib/generation-queue";
import { queueDir, queueStorePath } from "./paths";
import { withStoreLock } from "./store-lock";
import type { QueueSettings, QueueStoreState, ServerQueueJob } from "./types";

export const EMPTY_QUEUE_STATE: QueueStoreState = {
  version: 1,
  revision: 0,
  updatedAt: 0,
  paused: false,
  settings: {
    globalLimit: DEFAULT_GLOBAL_GENERATION_CONCURRENCY,
    laneLimits: { ...DEFAULT_GENERATION_LANE_LIMITS }
  },
  jobs: [],
  descriptors: {},
  breakers: {},
  quarantine: []
};

function cloneEmptyState(): QueueStoreState {
  return {
    ...EMPTY_QUEUE_STATE,
    revision: 0,
    settings: { globalLimit: EMPTY_QUEUE_STATE.settings.globalLimit, laneLimits: { ...DEFAULT_GENERATION_LANE_LIMITS } },
    jobs: [],
    descriptors: {},
    breakers: {},
    quarantine: []
  };
}

function normalizeSettings(value: unknown): QueueSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<QueueSettings>;
  const laneLimits = { ...DEFAULT_GENERATION_LANE_LIMITS, ...(raw.laneLimits || {}) };
  return {
    globalLimit: clampLimit(raw.globalLimit, DEFAULT_GLOBAL_GENERATION_CONCURRENCY),
    laneLimits: {
      image: clampLimit(laneLimits.image, DEFAULT_GENERATION_LANE_LIMITS.image),
      tool: clampLimit(laneLimits.tool, DEFAULT_GENERATION_LANE_LIMITS.tool),
      video: clampLimit(laneLimits.video, DEFAULT_GENERATION_LANE_LIMITS.video)
    }
  };
}

export function clampLimit(value: unknown, fallback: number) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(24, parsed));
}

export function normalizeQueueState(value: unknown): QueueStoreState {
  const raw = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Partial<QueueStoreState>;
  return {
    version: 1,
    revision: typeof raw.revision === "number" && Number.isFinite(raw.revision) ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    paused: Boolean(raw.paused),
    pauseReason: typeof raw.pauseReason === "string" ? raw.pauseReason : undefined,
    pausedAt: typeof raw.pausedAt === "number" ? raw.pausedAt : undefined,
    settings: normalizeSettings(raw.settings),
    jobs: Array.isArray(raw.jobs) ? (raw.jobs.filter((job) => job && typeof job === "object") as ServerQueueJob[]) : [],
    descriptors: raw.descriptors && typeof raw.descriptors === "object" ? { ...raw.descriptors } : {},
    breakers: raw.breakers && typeof raw.breakers === "object" ? { ...raw.breakers } : {},
    quarantine: Array.isArray(raw.quarantine) ? raw.quarantine : []
  };
}

export async function readQueueState(): Promise<QueueStoreState> {
  try {
    return normalizeQueueState(JSON.parse(await readFile(queueStorePath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return cloneEmptyState();
    throw error;
  }
}

async function writeQueueState(state: QueueStoreState) {
  await mkdir(queueDir(), { recursive: true });
  const target = queueStorePath();
  // Temp + rename keeps a reader from ever seeing a half-written store, matching
  // the collections and evaluation-annotation precedents.
  const temp = `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

let writeQueue: Promise<unknown> = Promise.resolve();

/** Serializes every mutation in-process so concurrent routes cannot interleave read-modify-write cycles. */
export function serializeQueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export type QueueMutation<T> = (state: QueueStoreState) => T | Promise<T>;

/**
 * Read-modify-write under the in-process lock. The mutation receives the live
 * state object, mutates it, and returns whatever the caller needs; the state is
 * persisted atomically afterwards.
 */
const MAX_STALE_RETRIES = 5;

export function mutateQueueState<T>(mutation: QueueMutation<T>): Promise<T> {
  return serializeQueueWrite(() =>
    withStoreLock(async () => {
      for (let attempt = 0; attempt <= MAX_STALE_RETRIES; attempt += 1) {
        const state = await readQueueState();
        const baseRevision = state.revision;
        const outcome = await mutation(state);
        // Another process can only have written here if it stole a stale lock.
        // Re-reading the revision under the lock turns that into a retry rather
        // than a silent lost update.
        const current = await readQueueState();
        if (current.revision !== baseRevision) continue;
        state.revision = baseRevision + 1;
        state.updatedAt = Date.now();
        await writeQueueState(state);
        return outcome;
      }
      throw new Error("The generation queue store is being written by another process; try again.");
    })
  );
}

export function findQueueJob(state: QueueStoreState, jobId: string) {
  return state.jobs.find((job) => job.id === jobId);
}

export function patchQueueJob(state: QueueStoreState, jobId: string, patch: Partial<ServerQueueJob>) {
  const job = findQueueJob(state, jobId);
  if (!job) return undefined;
  Object.assign(job, patch);
  return job;
}

export function quarantineEntry(state: QueueStoreState, fingerprint?: string) {
  if (!fingerprint) return undefined;
  return state.quarantine.find((entry) => entry.fingerprint === fingerprint);
}

export function recordQuarantineFailure(
  state: QueueStoreState,
  fingerprint: string | undefined,
  reason: string,
  threshold: number,
  now: number
) {
  if (!fingerprint) return undefined;
  const existing = quarantineEntry(state, fingerprint);
  if (existing) {
    existing.failures += 1;
    existing.reason = reason;
    if (existing.failures >= threshold && !existing.quarantinedAt) existing.quarantinedAt = now;
    return existing;
  }
  const entry = { fingerprint, failures: 1, quarantinedAt: threshold <= 1 ? now : 0, reason };
  state.quarantine.push(entry);
  return entry;
}

export function isQuarantined(state: QueueStoreState, fingerprint: string | undefined, threshold: number) {
  const entry = quarantineEntry(state, fingerprint);
  return Boolean(entry && entry.failures >= threshold);
}

export function laneBreaker(state: QueueStoreState, lane: GenerationLane) {
  return state.breakers[lane];
}

export function queueStoreLocation() {
  return queueStorePath();
}
