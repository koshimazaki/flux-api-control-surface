import type { GenerationQueueJob } from "@/lib/generation-queue";
import type { AssetRecord } from "@/lib/types";

export type GalleryGeneration = {
  job: GenerationQueueJob;
  assetId?: string;
  revealed?: boolean;
};

export type GalleryEntry = {
  key: string;
  timestamp: number;
  asset?: AssetRecord;
  generation?: GalleryGeneration;
};

export function isGenerationInFlight(job: GenerationQueueJob) {
  return ["submitting", "running", "downloading"].includes(job.status);
}

/** Follow live work, never replay the settled queue on initial hydration. Keep
 * resolved identities after queue cleanup so a finished tile doesn't remount. */
export function trackGalleryGenerations(
  previous: GalleryGeneration[], jobs: GenerationQueueJob[], assets: AssetRecord[], sessionStart: number
): GalleryGeneration[] {
  const assetsById = new Set(assets.map((asset) => asset.id));
  const previousById = new Map(previous.map((entry) => [entry.job.id, entry]));
  const presentJobs = new Set(jobs.map((job) => job.id));
  const next = jobs.flatMap((job): GalleryGeneration[] => {
    const prior = previousById.get(job.id);
    const settled = ["complete", "failed", "cancelled"].includes(job.status);
    if (settled && !prior && (job.finishedAt ?? 0) < sessionStart) return [];
    // Outputs and queue snapshots poll independently; image outputs can arrive
    // one poll ahead of resultAssetId. Provider identity is safe, titles aren't.
    const candidateId = job.resultAssetId || job.providerRequestId;
    const assetId = candidateId && assetsById.has(candidateId) ? candidateId : prior?.assetId;
    return [{ job, assetId, revealed: prior?.revealed }];
  });
  return [...next, ...previous.filter((entry) =>
    !presentJobs.has(entry.job.id) && entry.assetId && assetsById.has(entry.assetId)
  )];
}

export function galleryEntries(assets: AssetRecord[], generations: GalleryGeneration[]): GalleryEntry[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const claimed = new Set<string>();
  const entries = generations.flatMap((generation): GalleryEntry[] => {
    const asset = generation.assetId ? assetsById.get(generation.assetId) : undefined;
    if (generation.assetId && (!asset || claimed.has(generation.assetId))) return [];
    if (asset) claimed.add(asset.id);
    return [{ key: `job:${generation.job.id}`, timestamp: generation.job.createdAt, asset, generation }];
  });
  return [...entries, ...assets.filter((asset) => !claimed.has(asset.id)).map((asset) => ({
    key: `asset:${asset.id}`, timestamp: asset.timestamp, asset
  }))].sort((a, b) => b.timestamp - a.timestamp || a.key.localeCompare(b.key));
}

export type GenerationPatternVariant = "organic" | "mechanic" | "sweep";

export function generationPattern(id: string, variantOverride?: GenerationPatternVariant) {
  let seed = 2166136261;
  for (let i = 0; i < id.length; i++) seed = Math.imul(seed ^ id.charCodeAt(i), 16777619);
  seed >>>= 0;
  const variants = ["organic", "mechanic", "sweep"] as const;
  const variant = variantOverride ?? variants[seed % variants.length];
  const preset = variant === "organic" ? "pixels-organic" : variant === "sweep" ? "sweep-gradient" : "pixels-mechanic";
  return { variant, preset, seed, pixelScale: [0.7, 0.9, 1.15][(seed >>> 8) % 3] } as const;
}

export function generationElapsed(job: GenerationQueueJob, now: number) {
  if (job.startedAt === undefined) return null;
  const elapsed = Math.max(0, Math.floor(((job.finishedAt ?? now) - job.startedAt) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = String(elapsed % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
