import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { persistAssetImage } from "@/lib/dashboard-assets";
import type { Flux3ImageRequest } from "@/lib/flux3-image";
import { estimateTokens } from "@/lib/pricing";
import type { AssetRecord, ReferenceImage, RunLogEntry } from "@/lib/types";

/** One FLUX 3 Image run as the workspace hands it over. */
export type Flux3ImageRunInput = {
  request: Flux3ImageRequest;
  title: string;
  /** Library ids behind the references or the edit source. */
  sourceAssetIds: string[];
  referenceMeta?: Array<Partial<ReferenceImage>>;
};

/** A queued run the page is following; stored so a reload follows it again instead of resubmitting. */
export type PendingFlux3ImageRun = { jobId: string; title: string; prompt: string; startedAt: number };

export const FLUX3_IMAGE_PENDING_KEY = "bfl-flux3-image-pending";
const POLL_INTERVAL_MS = 1_500;
/** How many recent outputs to look through for a finished job's image. */
const OUTPUT_LOOKUP_LIMIT = 24;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type FollowOptions = { fetcher?: Fetcher; intervalMs?: number; signal?: { cancelled: boolean } };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A failure the queue reported, as opposed to a poll that may succeed next time. */
class Flux3ImageJobError extends Error {}

/**
 * Queues the run and returns its job id without waiting for the image. The
 * queue owns the paid job from here, so a slow render, a long queue or a
 * dropped connection can never make it look failed and invite a second submit.
 */
export async function submitFlux3ImageRun(body: Record<string, unknown>, fetcher: Fetcher = fetch) {
  const response = await fetcher("/api/bfl/flux3-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, wait: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.jobId !== "string") throw new Error(data.error || "FLUX 3 Image could not be queued.");
  return data.jobId as string;
}

async function blobToDataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

/** The output's real size, read from the image; the API sets it from the aspect ratio and tier. */
async function imageSize(blob: Blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: undefined, height: undefined };
  }
}

/**
 * A finished job's saved output, read through /api/outputs exactly as a
 * reload or another browser would read it, with its image inlined.
 */
export async function loadFlux3ImageOutput(assetId: string, fetcher: Fetcher = fetch): Promise<AssetRecord> {
  const response = await fetcher(`/api/outputs?limit=${OUTPUT_LOOKUP_LIMIT}`, { cache: "no-store" });
  const assets = response.ok ? ((await response.json()) as AssetRecord[]) : [];
  const asset = assets.find((item) => item.id === assetId);
  if (!asset) throw new Flux3ImageJobError(`FLUX 3 Image finished, but its output ${assetId} is not in Assets yet. Refresh Assets to load it.`);
  const image = await fetcher(asset.imageUrl || `/api/outputs/${encodeURIComponent(assetId)}/image`, { cache: "no-store" });
  if (!image.ok) throw new Flux3ImageJobError(`FLUX 3 Image finished, but its image ${assetId} could not be read.`);
  const blob = await image.blob();
  const { width, height } = asset.width && asset.height ? { width: asset.width, height: asset.height } : await imageSize(blob);
  return {
    ...asset,
    imageDataUrl: await blobToDataUrl(blob),
    width,
    height,
    aspectRatio: asset.aspectRatio ?? (width && height ? `${width}:${height}` : undefined)
  };
}

/**
 * Follows a queued run until the queue settles it, then loads its output.
 * Throws the queue's error when the job fails or is cancelled; a poll that
 * fails on the way is retried. Returns null when the page stops following.
 */
export async function followFlux3ImageJob(jobId: string, options: FollowOptions = {}): Promise<AssetRecord | null> {
  const { fetcher = fetch, intervalMs = POLL_INTERVAL_MS, signal } = options;
  while (!signal?.cancelled) {
    try {
      const response = await fetcher(`/api/dashboard/queue?id=${encodeURIComponent(jobId)}`, { cache: "no-store" });
      if (response.status === 404) {
        throw new Flux3ImageJobError(`FLUX 3 Image job ${jobId} is no longer on the server queue. Check Assets for its result.`);
      }
      if (response.ok) {
        const job = ((await response.json()).job || {}) as { status?: string; error?: string; resultAssetId?: string };
        if (job.status === "complete" && job.resultAssetId) return await loadFlux3ImageOutput(job.resultAssetId, fetcher);
        if (job.status === "failed" || job.status === "cancelled") {
          throw new Flux3ImageJobError(job.error || `The FLUX 3 Image job was ${job.status}.`);
        }
      }
    } catch (error) {
      if (error instanceof Flux3ImageJobError) throw error;
      // A dropped poll is not a failed job; the next poll asks again.
    }
    await wait(intervalMs);
  }
  return null;
}

function readPending(): PendingFlux3ImageRun | null {
  try {
    const stored = JSON.parse(localStorage.getItem(FLUX3_IMAGE_PENDING_KEY) || "null");
    return stored && typeof stored.jobId === "string" ? (stored as PendingFlux3ImageRun) : null;
  } catch {
    return null;
  }
}

function writePending(pending: PendingFlux3ImageRun | null) {
  try {
    if (pending) localStorage.setItem(FLUX3_IMAGE_PENDING_KEY, JSON.stringify(pending));
    else localStorage.removeItem(FLUX3_IMAGE_PENDING_KEY);
  } catch {
    // Storage can be blocked; the run is still followed for as long as the page is open.
  }
}

function runLogEntry(run: PendingFlux3ImageRun, outcome: { asset?: AssetRecord; error?: string }): RunLogEntry {
  const { asset, error } = outcome;
  return {
    id: asset?.id ?? `failed-flux3-image-${Date.now()}`,
    title: run.title,
    timestamp: Date.now(),
    model: "flux-3-image",
    status: error ? "failed" : "complete",
    promptTokens: estimateTokens(run.prompt),
    estimatedCredits: 0,
    actualCredits: asset?.costCredits,
    durationMs: Date.now() - run.startedAt,
    error,
    prompt: run.prompt,
    width: asset?.width,
    height: asset?.height
  };
}

type Flux3ImageRunDeps = {
  apiKey: string;
  setAssets: Dispatch<SetStateAction<AssetRecord[]>>;
  setRunLog: Dispatch<SetStateAction<RunLogEntry[]>>;
  setSelectedAsset: (asset: AssetRecord | null) => void;
  setError: (message: string) => void;
  setRecoveryMessage: (message: string) => void;
  checkBalance: () => unknown;
};

/**
 * Runs FLUX 3 Image through the server queue: queue it, follow the job, and
 * file the saved output like any generation. One run at a time; while a job
 * is pending, Generate stays busy rather than queueing a second paid job.
 */
export function useFlux3ImageRun(deps: Flux3ImageRunDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const [pending, setPending] = useState<PendingFlux3ImageRun | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A run queued before a reload is followed again.
  useEffect(() => {
    const stored = readPending();
    if (stored) setPending(stored);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const signal = { cancelled: false };
    const settle = (outcome: { asset?: AssetRecord; error?: string }) => {
      if (signal.cancelled) return;
      const current = depsRef.current;
      writePending(null);
      setPending(null);
      current.setRunLog((log) => [runLogEntry(pending, outcome), ...log]);
      if (outcome.error) current.setError(outcome.error);
      void current.checkBalance();
    };
    void (async () => {
      try {
        const asset = await followFlux3ImageJob(pending.jobId, { signal });
        if (!asset || signal.cancelled) return;
        await persistAssetImage(asset.id, asset.imageDataUrl);
        const current = depsRef.current;
        current.setAssets((assets) => [asset, ...assets.filter((item) => item.id !== asset.id)]);
        current.setSelectedAsset(asset);
        current.setRecoveryMessage(`FLUX 3 Image saved: ${pending.title}.`);
        settle({ asset });
      } catch (error) {
        settle({ error: error instanceof Error ? error.message : "FLUX 3 Image generation failed." });
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, [pending]);

  async function runFlux3Image(input: Flux3ImageRunInput) {
    if (pending || isSubmitting) {
      deps.setError("A FLUX 3 Image job is still running. Its result is filed here when it is ready.");
      return null;
    }
    deps.setError("");
    setIsSubmitting(true);
    try {
      const jobId = await submitFlux3ImageRun({
        ...input.request,
        apiKey: deps.apiKey || undefined,
        title: input.title,
        sourceAssetIds: input.sourceAssetIds,
        referenceMeta: input.referenceMeta
      });
      const run = { jobId, title: input.title, prompt: input.request.prompt?.trim() || "", startedAt: Date.now() };
      writePending(run);
      setPending(run);
      deps.setRecoveryMessage(`FLUX 3 Image queued: ${input.title}. It keeps running if you reload this page.`);
      return jobId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "FLUX 3 Image could not be queued.";
      deps.setRunLog((log) => [runLogEntry({ jobId: "", title: input.title, prompt: input.request.prompt || "", startedAt: Date.now() }, { error: message }), ...log]);
      deps.setError(message);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return { runFlux3Image, isFlux3ImageRunning: isSubmitting || Boolean(pending) };
}
