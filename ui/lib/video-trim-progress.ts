/**
 * Progress for an in-flight local cut, so the UI can show a real percentage
 * rather than a spinner. The cut is a single synchronous request, so this is a
 * small in-process registry the browser polls, not queue state.
 */
export type TrimProgress = { percent: number; updatedAt: number; done?: boolean; error?: string };

const REGISTRY_KEY = Symbol.for("bfl.videoTrimProgress");
const STALE_MS = 5 * 60_000;

function registry(): Map<string, TrimProgress> {
  const holder = globalThis as unknown as Record<symbol, Map<string, TrimProgress> | undefined>;
  // Cached on globalThis so Next dev's module reloading cannot orphan a run.
  if (!holder[REGISTRY_KEY]) holder[REGISTRY_KEY] = new Map();
  return holder[REGISTRY_KEY]!;
}

function prune(store: Map<string, TrimProgress>) {
  const cutoff = Date.now() - STALE_MS;
  for (const [id, entry] of store) {
    if (entry.updatedAt < cutoff) store.delete(id);
  }
}

export function setTrimProgress(id: string, progress: Omit<TrimProgress, "updatedAt">) {
  if (!id) return;
  const store = registry();
  prune(store);
  store.set(id, { ...progress, percent: Math.max(0, Math.min(100, progress.percent)), updatedAt: Date.now() });
}

export function readTrimProgress(id: string): TrimProgress | null {
  return registry().get(id) || null;
}

export function clearTrimProgress(id: string) {
  registry().delete(id);
}

/**
 * ffmpeg's `-progress` stream reports `out_time_us` in microseconds — and so
 * does `out_time_ms`, despite its name. Both are read as microseconds here.
 */
export function percentFromProgressChunk(chunk: string, targetSeconds: number) {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) return null;
  const matches = [...chunk.matchAll(/out_time_(?:us|ms)=(\d+)/g)];
  const latest = matches[matches.length - 1];
  if (!latest) return null;
  const seconds = Number(latest[1]) / 1_000_000;
  if (!Number.isFinite(seconds)) return null;
  return Math.max(0, Math.min(100, (seconds / targetSeconds) * 100));
}
