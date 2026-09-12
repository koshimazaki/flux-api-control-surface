"use client";

import { useEffect, useRef, useState } from "react";
import { AssetLibrary } from "@/components/asset-library";
import { Lightbox } from "@/components/lightbox";
import { JobQueue } from "@/components/ui/job-queue";
import { useGalleryGenerations } from "@/lib/dashboard/use-gallery-generations";
import { generationPattern } from "@/lib/gallery-generations";
import { summarizeGenerationQueue, type GenerationQueueJob } from "@/lib/generation-queue";
import type { AssetCollectionFilter, AssetRecord, AspectRatio } from "@/lib/types";

const noop = () => {};
const VARIANTS = ["organic", "mechanic", "sweep"] as const;
const LABELS = ["Organic flow", "Mechanical mosaic", "Gradient sweep"];

function previewId(variant: typeof VARIANTS[number], run: number) {
  for (let i = 0; ; i++) {
    const id = `preview-${run}-${variant}-${i}`;
    if (generationPattern(id).variant === variant) return id;
  }
}

export function GalleryFeedbackPreview() {
  const [samples, setSamples] = useState<AssetRecord[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [jobs, setJobs] = useState<GenerationQueueJob[]>([]);
  const [filter, setFilter] = useState<AssetCollectionFilter[]>([]);
  const [ratio, setRatio] = useState<AspectRatio>("1:1");
  const [grid, setGrid] = useState(3);
  const [search, setSearch] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const run = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gallery = useGalleryGenerations(jobs, assets);
  useEffect(() => {
    let cancelled = false;
    const scheduled = timers.current;
    fetch("/api/outputs?limit=40").then((response) => response.json()).then((data) => {
      if (!cancelled && Array.isArray(data)) setSamples(data);
    }).catch(() => {});
    return () => { cancelled = true; scheduled.forEach(clearTimeout); };
  }, []);

  function start() {
    timers.current.forEach(clearTimeout);
    const now = Date.now();
    run.current++;
    setAssets([]);
    const queued = VARIANTS.map((variant, index): GenerationQueueJob => ({
      id: previewId(variant, run.current), title: LABELS[index], kind: mediaType === "video" ? "video" : "image",
      lane: mediaType === "video" ? "video" : "image", operation: "preview", createdAt: now - index,
      status: index === 0 ? "running" : "queued", startedAt: index === 0 ? now : undefined
    }));
    setJobs(queued);
    queued.slice(1).forEach((job, i) => timers.current.push(setTimeout(() => {
      setJobs((current) => current.map((entry) => entry.id === job.id ? { ...entry, status: "running", startedAt: Date.now() } : entry));
    }, (i + 1) * 1600)));
  }

  function reveal() {
    timers.current.forEach(clearTimeout);
    const sources = samples.filter((asset) => (asset.mediaType === "video" ? "video" : "image") === mediaType);
    if (!sources.length) return;
    const now = Date.now();
    const results = jobs.map((job, i) => ({ ...sources[i % sources.length], id: `result-${job.id}`, title: job.title, timestamp: now - i }));
    // Exercise independent queue and output polling, just like the dashboard.
    setJobs((current) => current.map((job, i) => ({ ...job, status: "complete", finishedAt: now, resultAssetId: results[i].id })));
    timers.current.push(setTimeout(() => setAssets(results), 700));
  }

  const collection = { id: "preview-collection", name: "Motion studies", createdAt: 0, updatedAt: 0,
    members: samples.slice(0, 4).map((asset) => ({ assetId: asset.id, kind: "generation" as const, addedAt: 0 })) };
  const allAssets = [...assets, ...samples.slice(0, 4)];
  const summary = summarizeGenerationQueue(jobs);
  const controls = { paused: false, onPause: noop, onResume: noop, onPrioritize: noop,
    onCancel: (id: string) => setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "cancelled", finishedAt: Date.now() } : job)),
    onRetry: (id: string) => setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "running", startedAt: Date.now(), finishedAt: undefined } : job)),
    onDismiss: (id: string) => setJobs((current) => current.filter((job) => job.id !== id)),
    onClearSettled: () => setJobs((current) => current.filter((job) => !["complete", "cancelled", "failed"].includes(job.status))) };
  return <main className="shell dsgn-root galleryFeedbackPreview" data-theme="cyberpunk-v2" data-surface-theme="reflective">
    <h1>Gallery motion preview</h1>
    <p>Local playback with saved media. No generation requests or credits.</p>
    <div className="galleryPreviewControls">
      <select aria-label="Preview media" value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
        <option value="image">Images</option><option value="video">Videos</option>
      </select>
      <button onClick={start}>Start three patterns</button>
      <button onClick={reveal} disabled={!jobs.length || !samples.length}>Reveal results</button>
      <button onClick={() => { timers.current.forEach(clearTimeout); setJobs((current) => current.map((job) => ({ ...job, status: "failed", error: "Preview failure — retry or dismiss", finishedAt: Date.now() }))); }}>Show failure</button>
    </div>
    <JobQueue queue={jobs} summary={summary} concurrency={3} controls={controls} />
    <AssetLibrary assets={allAssets} filteredAssets={allAssets.filter((asset) => !search || asset.title?.toLowerCase().includes(search.toLowerCase()))}
      generations={gallery.generations} onGenerationRevealed={gallery.markRevealed}
      searchQuery={search} gridSize={grid} aspectRatio={ratio} metadataAssetId={null} selectedAssetIds={[]} assetBadges={{}}
      collections={[collection]} collectionFilter={filter} openedCollection={openedId ? collection : null}
      onSearchChange={setSearch} onGridSizeChange={setGrid} onAspectRatioChange={setRatio} onCollectionFilterChange={setFilter}
      onOpenCollection={setOpenedId} onCreateCollection={noop} onAddAssetsToCollection={noop} onAddSelectedToCollection={noop}
      onAddFilesToCollection={noop} onRemoveFromCollection={noop} onExportCollection={noop} onDeleteCollection={noop}
      onExport={noop} onClear={noop} onRecover={noop} onImportImages={noop} onToggleFavorite={noop} onSendToPrompt={noop}
      onSendToWorkspace={noop} onSendToVtoGarment={noop} onSendToReference={noop} onSavePromptToLibrary={noop}
      onToggleSelected={noop} onToggleMetadata={noop} onOpen={setPreviewAsset} onDownload={noop} onDelete={noop} />
    <Lightbox asset={previewAsset} assets={allAssets} onNavigate={setPreviewAsset} onClose={() => setPreviewAsset(null)}
      onSendToPrompt={noop} onSendToWorkspace={noop} onSendToReference={noop} onDownload={noop} />
  </main>;
}
