import { Download, Film, ScanLine, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { VideoComparisonFader } from "@/components/video-comparison-fader";
import { JobQueue, type JobQueueControls } from "@/components/ui/job-queue";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import type { GenerationQueueJob, GenerationQueueSummary } from "@/lib/generation-queue";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import {
  estimateVideoUpscaleUsd,
  videoUpscaleRequestBlocker,
  type VideoUpscaleCreativity,
  type VideoUpscaleRequest,
  type VideoUpscaleResult,
  type VideoUpscaleSourceInput
} from "@/lib/video-upscale";
import type { AssetRecord } from "@/lib/types";

type SourceVideo = {
  id: string;
  name: string;
  source: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  assetId?: string;
};

type VideoUpscaleWorkspaceProps = {
  apiKey: string;
  assets: AssetRecord[];
  /** Video sent from another surface (library card, FLUX 3 header); nonce re-applies repeat sends. */
  pendingSource?: (VideoUpscaleSourceInput & { nonce: number }) | null;
  onGenerated: () => void;
  onOpenAssets: () => void;
  generationQueue: GenerationQueueJob[];
  generationQueueSummary: GenerationQueueSummary;
  generationQueueConcurrency: number;
  generationQueueControls?: JobQueueControls;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function inspectVideo(source: string) {
  return new Promise<{ width?: number; height?: number; duration?: number }>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      duration: Number.isFinite(video.duration) ? video.duration : undefined
    });
    video.onerror = () => resolve({});
    video.src = source;
  });
}

export function VideoUpscaleWorkspace(props: VideoUpscaleWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [source, setSource] = useState<SourceVideo | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [factor, setFactor] = useState(2);
  const [creativity, setCreativity] = useState<VideoUpscaleCreativity>(1);
  const [prompt, setPrompt] = useState("");
  const [safetyTolerance, setSafetyTolerance] = useState(2);
  const [results, setResults] = useState<VideoUpscaleResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingQueueJobId, setPendingQueueJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const selected = selectedId ? results.find((item) => item.id === selectedId) || null : null;
  const request = useMemo<VideoUpscaleRequest>(() => ({
    inputVideo: source?.source || "",
    upscaleFactor: factor,
    creativity,
    prompt,
    safetyTolerance,
    sourceAssetId: source?.assetId,
    sourceName: source?.name,
    sourceBytes: source?.bytes,
    sourceWidth: source?.width,
    sourceHeight: source?.height,
    durationSeconds: source?.duration
  }), [creativity, factor, prompt, safetyTolerance, source]);
  const blocker = videoUpscaleRequestBlocker(request);
  const estimatedUsd = estimateVideoUpscaleUsd(request);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bfl/video-upscale", { cache: "no-store" })
      .then(async (response) => response.ok ? ((await response.json()).results as VideoUpscaleResult[]) : [])
      .then((items) => {
        if (cancelled) return;
        setResults(items);
        setSelectedId((current) => current || items[0]?.id || null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const seed = props.pendingSource;
    if (!seed?.url) return;
    let cancelled = false;
    void inspectVideo(seed.url).then((details) => {
      if (cancelled) return;
      setSource({ id: seed.assetId || `sent-${seed.nonce}`, assetId: seed.assetId, name: seed.name, source: seed.url, ...details });
      setSelectedId(null);
      setError("");
    });
    return () => { cancelled = true; };
  }, [props.pendingSource]);

  useEffect(() => {
    if (!pendingQueueJobId) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/dashboard/queue?id=${encodeURIComponent(pendingQueueJobId)}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const job = (await response.json()).job as { status?: string; error?: string; resultAssetId?: string };
        if (job.status === "complete") {
          const saved = await fetch("/api/bfl/video-upscale", { cache: "no-store" });
          const items = saved.ok ? (((await saved.json()).results || []) as VideoUpscaleResult[]) : [];
          const match = items.find((item) => item.id === job.resultAssetId) || items[0];
          if (match) {
            setResults((current) => [match, ...current.filter((item) => item.id !== match.id)]);
            setSelectedId(match.id);
            props.onGenerated();
          }
          setPendingQueueJobId(null);
          setWarning("");
        } else if (job.status === "failed" || job.status === "cancelled") {
          setPendingQueueJobId(null);
          setWarning("");
          setError(job.error || `The upscale job was ${job.status}.`);
        }
      } catch {
        // A later poll retries transient dashboard errors.
      }
    }, 8_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [pendingQueueJobId, props]);

  async function selectFile(file: File) {
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setError("Video Upscale accepts an MP4 clip.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    const details = await inspectVideo(dataUrl);
    setSource({ id: `file-${Date.now()}`, name: file.name, source: dataUrl, bytes: file.size, ...details });
    setSelectedId(null);
    setError("");
  }

  async function selectAsset(asset: AssetRecord) {
    if (asset.mediaType !== "video" || !asset.videoUrl) {
      setError("Drop a saved video asset into Video Upscale.");
      return;
    }
    const details = await inspectVideo(asset.videoUrl);
    setSource({ id: asset.id, assetId: asset.id, name: asset.title || "Saved video", source: asset.videoUrl, ...details });
    setSelectedId(null);
    setError("");
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const payload = event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) || event.dataTransfer.getData("text/plain");
    if (payload.startsWith("asset:")) {
      const asset = props.assets.find((item) => item.id === payload.slice("asset:".length));
      if (asset) void selectAsset(asset);
      return;
    }
    const file = Array.from(event.dataTransfer.files || [])[0];
    if (file) void selectFile(file);
  }

  async function run() {
    if (blocker) { setError(blocker); return; }
    setError("");
    setWarning("");
    setIsRunning(true);
    try {
      const response = await fetch("/api/bfl/video-upscale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, apiKey: props.apiKey || undefined, title: source?.name ? `${source.name} · ${factor}×` : undefined })
      });
      const data = await response.json();
      if (!response.ok) {
        const queueJobId = data?.details?.queueJobId;
        if (queueJobId) {
          setPendingQueueJobId(String(queueJobId));
          setWarning("Still upscaling on the server queue. The result will be saved automatically; do not submit it again.");
          return;
        }
        throw new Error(data.error || "FLUX 3 Video Upscale failed.");
      }
      const next = data as VideoUpscaleResult;
      setResults((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setSelectedId(next.id);
      props.onGenerated();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "FLUX 3 Video Upscale failed.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section className="videoUpscaleWorkspace">
      {/* The whole preview panel accepts drops: a saved result or current source
          replaces the empty dropzone, and dropping a new clip must still work. */}
      <div
        className={`videoUpscalePreview panel${isDropActive ? " dropReady" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDropActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropActive(false);
        }}
        onDrop={(event) => {
          setIsDropActive(false);
          handleDrop(event);
        }}
      >
        <PanelHeader title="Video Upscale" subtitle="FLUX 3 VIDEO UPSCALE · 2K / 4K">
          <div className="flux3HeaderTools">
            <span className="flux3HeaderIcon" aria-label="FLUX 3 Video Upscale"><ScanLine size={18} /></span>
          </div>
        </PanelHeader>
        {selected ? (
          <VideoComparisonFader beforeUrl={selected.sourceVideoUrl} afterUrl={selected.videoUrl} />
        ) : source ? (
          <div className="videoUpscaleSourcePreview">
            <video src={source.source} controls playsInline preload="metadata" />
            <div><Film size={16} /><strong>{source.name}</strong><button type="button" onClick={() => setSource(null)} title="Remove source"><X size={14} /></button></div>
          </div>
        ) : (
          <button className="videoUpscaleDrop" type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={28} />
            <strong>Drop an MP4 or saved FLUX 3 video</strong>
            <span>Maximum 50 MB · 20 seconds · 2560 × 1440 input</span>
          </button>
        )}
        <input ref={inputRef} hidden type="file" accept="video/mp4,.mp4" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void selectFile(file);
          event.target.value = "";
        }} />
        {selected && (
          <div className="videoUpscaleResultBar">
            <div><strong>{selected.title}</strong><span>{selected.upscaleFactor}× · {selected.creativity ? "Creative" : "Precise"} · audio preserved</span></div>
            <div><a href={`${selected.videoUrl}?download=1`}><Download size={14} />Download</a><button type="button" onClick={props.onOpenAssets}>Assets</button></div>
          </div>
        )}
      </div>
      <aside className="videoUpscaleControls panel controls">
        <PanelHeader title="Upscale video" subtitle="Resolution recovery with optional detail invention"><ScanLine size={18} /></PanelHeader>
        <div className="videoUpscaleModePicker">
          <button type="button" className={creativity === 0 ? "active" : ""} onClick={() => setCreativity(0)}><strong>Precise</strong><small>Faithful recovery</small></button>
          <button type="button" className={creativity === 1 ? "active" : ""} onClick={() => setCreativity(1)}><strong>Creative</strong><small>Invent fine detail</small></button>
        </div>
        <label>Upscale factor <span>{factor.toFixed(1)}×</span><input type="range" min="1.5" max="3" step="0.1" value={factor} onChange={(event) => setFactor(Number(event.target.value))} /></label>
        <div className="videoUpscaleTarget">
          <span>Target</span>
          <strong>{source?.width && source?.height ? `${Math.round(source.width * factor)} × ${Math.round(source.height * factor)}` : factor >= 2.5 ? "Up to 4K" : "Up to 2K"}</strong>
          <small>{source?.duration ? `${source.duration.toFixed(1)} sec · source ${source.width} × ${source.height}` : "Source metadata appears after selection."}</small>
        </div>
        <label>Optional detail prompt<textarea rows={5} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe texture or detail to recover without changing the shot…" /></label>
        <label>Safety<select value={safetyTolerance} onChange={(event) => setSafetyTolerance(Number(event.target.value))}>{[0, 1, 2, 3, 4].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <div className="videoUpscaleCost"><span>Estimate</span><strong>{estimatedUsd === null ? "After source metadata" : `$${estimatedUsd.toFixed(2)}`}</strong><small>{creativity ? "$0.10" : "$0.07"} per output MP-second</small></div>
        {(error || warning) && <p className={error ? "errorBox" : "flux3Warning"}>{error || warning}</p>}
        <JobQueue queue={props.generationQueue} summary={props.generationQueueSummary} concurrency={props.generationQueueConcurrency} controls={props.generationQueueControls} />
        <RunButton isRunning={isRunning || Boolean(pendingQueueJobId)} onClick={() => void run()} disabled={Boolean(blocker) || Boolean(pendingQueueJobId)} icon={Sparkles}>Upscale with FLUX 3</RunButton>
        {blocker && !error && <p className="flux3Blocker">{blocker}</p>}
      </aside>
    </section>
  );
}
