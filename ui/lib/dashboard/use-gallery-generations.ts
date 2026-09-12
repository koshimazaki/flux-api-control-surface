import { useCallback, useEffect, useState } from "react";
import { trackGalleryGenerations, type GalleryGeneration } from "@/lib/gallery-generations";
import type { GenerationQueueJob } from "@/lib/generation-queue";
import type { AssetRecord } from "@/lib/types";

export function useGalleryGenerations(jobs: GenerationQueueJob[], assets: AssetRecord[]) {
  const [sessionStart] = useState(Date.now);
  const [generations, setGenerations] = useState<GalleryGeneration[]>([]);
  useEffect(() => {
    setGenerations((previous) => trackGalleryGenerations(previous, jobs, assets, sessionStart));
  }, [jobs, assets, sessionStart]);
  const markRevealed = useCallback((jobId: string) => {
    setGenerations((previous) => previous.map((entry) => entry.job.id === jobId ? { ...entry, revealed: true } : entry));
  }, []);
  return { generations, markRevealed };
}
