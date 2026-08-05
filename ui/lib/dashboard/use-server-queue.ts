"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_GENERATION_LANE_LIMITS,
  DEFAULT_GLOBAL_GENERATION_CONCURRENCY,
  summarizeGenerationQueue,
  type GenerationLaneLimits,
  type GenerationQueueJob
} from "@/lib/generation-queue";

const ACTIVE_POLL_MS = 1_500;
const IDLE_POLL_MS = 6_000;

export type ServerQueueJob = GenerationQueueJob & {
  queuedAt?: number;
  failureClass?: string;
  actualCredits?: number;
  queueWaitMs?: number;
  batchId?: string;
};

export type ServerQueueSnapshot = {
  jobs: ServerQueueJob[];
  paused: boolean;
  pauseReason?: string;
  settings: { globalLimit: number; laneLimits: GenerationLaneLimits };
  quarantine: Array<{ fingerprint: string; failures: number; reason: string }>;
  storePath?: string;
};

export type ServerQueueEnqueueJob = {
  kind: "image" | "tool" | "video";
  operation?: string;
  title?: string;
  payload: Record<string, unknown>;
  priority?: number;
  batchId?: string;
  batchIndex?: number;
  batchTotal?: number;
  estimatedCredits?: number;
  estimatedUsd?: number;
  promptTokens?: number;
  sourceAssetIds?: string[];
};

const EMPTY: ServerQueueSnapshot = {
  jobs: [],
  paused: false,
  settings: { globalLimit: DEFAULT_GLOBAL_GENERATION_CONCURRENCY, laneLimits: { ...DEFAULT_GENERATION_LANE_LIMITS } },
  quarantine: []
};

async function readQueueResponse(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The generation queue is unavailable.");
  return data;
}

/**
 * The dashboard is an observer and controller of the server-owned queue, never
 * its scheduler. State is read back from /api/dashboard/queue so it survives a
 * refresh and a server restart.
 */
export function useServerQueue(options: { onError?: (message: string) => void } = {}) {
  const [snapshot, setSnapshot] = useState<ServerQueueSnapshot>(EMPTY);
  const [isReady, setIsReady] = useState(false);
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const refresh = useCallback(async () => {
    try {
      const data = await readQueueResponse(await fetch("/api/dashboard/queue", { cache: "no-store" }));
      setSnapshot({
        jobs: Array.isArray(data.jobs) ? data.jobs : [],
        paused: Boolean(data.paused),
        pauseReason: data.pauseReason,
        settings: data.settings || EMPTY.settings,
        quarantine: Array.isArray(data.quarantine) ? data.quarantine : [],
        storePath: data.storePath
      });
      setIsReady(true);
      return data;
    } catch {
      // A transient read failure should not blank the last known queue.
      return null;
    }
  }, []);

  const summary = useMemo(() => summarizeGenerationQueue(snapshot.jobs), [snapshot.jobs]);
  const hasActiveWork = summary.active > 0;
  const hasActiveWorkRef = useRef(hasActiveWork);
  hasActiveWorkRef.current = hasActiveWork;

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      // Poll fast while paid work is moving, slowly when the queue is idle.
      timer = window.setTimeout(tick, hasActiveWorkRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [refresh]);

  const control = useCallback(
    async (body: Record<string, unknown>) => {
      try {
        await readQueueResponse(
          await fetch("/api/dashboard/queue", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          })
        );
        await refresh();
        return true;
      } catch (error) {
        onErrorRef.current?.(error instanceof Error ? error.message : "The queue action failed.");
        return false;
      }
    },
    [refresh]
  );

  const enqueue = useCallback(
    async (jobs: ServerQueueEnqueueJob[]) => {
      const data = await readQueueResponse(
        await fetch("/api/dashboard/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs })
        })
      );
      await refresh();
      return (data.jobs || []) as ServerQueueJob[];
    },
    [refresh]
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await readQueueResponse(
          await fetch(`/api/dashboard/queue?id=${encodeURIComponent(id)}`, { method: "DELETE" })
        );
        await refresh();
        return true;
      } catch (error) {
        onErrorRef.current?.(error instanceof Error ? error.message : "Could not cancel the job.");
        return false;
      }
    },
    [refresh]
  );

  return {
    queue: snapshot.jobs,
    summary,
    paused: snapshot.paused,
    pauseReason: snapshot.pauseReason,
    settings: snapshot.settings,
    quarantine: snapshot.quarantine,
    storePath: snapshot.storePath,
    isReady,
    refresh,
    enqueue,
    cancel,
    pause: (reason?: string) => control({ action: "pause", reason }),
    resume: () => control({ action: "resume" }),
    retry: (id: string) => control({ action: "retry", id }),
    prioritize: (id: string, priority: number) => control({ action: "priority", id, priority }),
    clearSettled: () => control({ action: "clear-settled" }),
    setLimits: (globalLimit: number, laneLimits?: Partial<GenerationLaneLimits>) =>
      control({ action: "settings", globalLimit, laneLimits })
  };
}

export type ServerQueueController = ReturnType<typeof useServerQueue>;
