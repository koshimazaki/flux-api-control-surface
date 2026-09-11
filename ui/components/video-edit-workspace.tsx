import { Download, Film, PencilLine, Repeat, ScanLine, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { VideoComparisonFader } from "@/components/video-comparison-fader";
import { IconButton } from "@/components/ui/icon-button";
import { JobQueue, type JobQueueControls } from "@/components/ui/job-queue";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import type { GenerationQueueJob, GenerationQueueSummary } from "@/lib/generation-queue";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import type { AssetRecord } from "@/lib/types";
import {
  VIDEO_EDIT_PROMPT_MAX_CHARS,
  VIDEO_EDIT_PROMPT_STARTERS,
  VIDEO_EDIT_USD_PER_SECOND,
  estimateVideoEditUsd,
  videoEditRequestBlocker,
  type VideoEditRequest,
  type VideoEditResult,
  type VideoEditSourceInput
} from "@/lib/video-edit";
import { inspectVideo, readFileAsDataUrl } from "@/lib/video-media-client";
import { videoStageStyle } from "@/lib/video-stage";
import type { VideoUpscaleSourceInput } from "@/lib/video-upscale";

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

type VideoEditWorkspaceProps = {
  apiKey: string;
  assets: AssetRecord[];
  /** Clip handed over from another surface (library card, lightbox, FLUX 3 header); the nonce re-applies repeat sends. */
  pendingSource?: (VideoEditSourceInput & { nonce: number }) | null;
  onGenerated: () => void;
  onOpenAssets: () => void;
  /** Hands the selected edit to Video Upscale — edits come back at 720p or below. */
  onSendToUpscale?: (source: VideoUpscaleSourceInput) => void;
  generationQueue: GenerationQueueJob[];
  generationQueueSummary: GenerationQueueSummary;
  generationQueueConcurrency: number;
  generationQueueControls?: JobQueueControls;
};

function sourceMeta(source: SourceVideo) {
  const parts: string[] = [];
  if (source.duration) parts.push(`${source.duration.toFixed(1)} s`);
  if (source.width && source.height) parts.push(`${source.width} × ${source.height}`);
  return parts.join(" · ") || "Reading clip metadata…";
}

export function VideoEditWorkspace(props: VideoEditWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [source, setSource] = useState<SourceVideo | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [isSlotDropActive, setIsSlotDropActive] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [safetyTolerance, setSafetyTolerance] = useState(2);
  const [results, setResults] = useState<VideoEditResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingQueueJobId, setPendingQueueJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const selected = selectedId ? results.find((item) => item.id === selectedId) || null : null;
  const request = useMemo<VideoEditRequest>(() => ({
    inputVideo: source?.source || "",
    prompt,
    safetyTolerance,
    sourceAssetId: source?.assetId,
    sourceName: source?.name,
    sourceBytes: source?.bytes,
    sourceWidth: source?.width,
    sourceHeight: source?.height,
    durationSeconds: source?.duration
  }), [prompt, safetyTolerance, source]);
  const blocker = videoEditRequestBlocker(request);
  const estimatedUsd = estimateVideoEditUsd(request);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bfl/video-edit", { cache: "no-store" })
      .then(async (response) => response.ok ? ((await response.json()).results as VideoEditResult[]) : [])
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
          const saved = await fetch("/api/bfl/video-edit", { cache: "no-store" });
          const items = saved.ok ? (((await saved.json()).results || []) as VideoEditResult[]) : [];
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
          setError(job.error || `The edit job was ${job.status}.`);
        }
      } catch {
        // A later poll retries transient dashboard errors.
      }
    }, 8_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [pendingQueueJobId, props]);

  function adoptSource(next: SourceVideo) {
    setSource(next);
    setSelectedId(null);
    setError("");
  }

  async function selectFile(file: File) {
    if (file.type !== "video/mp4" && !file.name.toLowerCase().endsWith(".mp4")) {
      setError("Video Edit accepts an MP4 clip.");
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    const details = await inspectVideo(dataUrl);
    adoptSource({ id: `file-${Date.now()}`, name: file.name, source: dataUrl, bytes: file.size, ...details });
  }

  async function selectAsset(asset: AssetRecord) {
    if (asset.mediaType !== "video" || !asset.videoUrl) {
      setError("Drop a saved video asset into Video Edit.");
      return;
    }
    const details = await inspectVideo(asset.videoUrl);
    adoptSource({ id: asset.id, assetId: asset.id, name: asset.title || "Saved video", source: asset.videoUrl, ...details });
  }

  /** Sequential passes: BFL's guide recommends one change per edit, then editing the result. */
  async function editResultAgain(result: VideoEditResult) {
    const details = await inspectVideo(result.videoUrl);
    adoptSource({ id: `edit-${result.id}`, assetId: result.id, name: result.title, source: result.videoUrl, ...details });
    setPrompt("");
    promptRef.current?.focus();
  }

  function insertStarter(text: string) {
    setPrompt(text);
    promptRef.current?.focus();
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
      const instruction = prompt.trim();
      const title = source?.name ? `${source.name} · ${instruction.slice(0, 48)}` : instruction.slice(0, 72);
      const response = await fetch("/api/bfl/video-edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, apiKey: props.apiKey || undefined, title })
      });
      const data = await response.json();
      if (!response.ok) {
        const queueJobId = data?.details?.queueJobId;
        if (queueJobId) {
          setPendingQueueJobId(String(queueJobId));
          setWarning("Still editing on the server queue. The result is saved automatically; do not submit it again.");
          return;
        }
        throw new Error(data.error || "FLUX Video Edit failed.");
      }
      const next = data as VideoEditResult;
      setResults((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setSelectedId(next.id);
      props.onGenerated();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "FLUX Video Edit failed.");
    } finally {
      setIsRunning(false);
    }
  }

  const promptLength = prompt.trim().length;

  return (
    <section className="videoEditWorkspace">
      {/* The whole preview panel accepts drops, like Video Upscale: a saved result
          or the current source replaces the empty dropzone, and a new clip must
          still be able to land. */}
      <div
        className={`videoEditPreview panel${isDropActive ? " dropReady" : ""}`}
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
        <PanelHeader title="Video Edit" subtitle="FLUX VIDEO EDIT · DESCRIBE THE CHANGE, KEEP THE SHOT">
          <div className="flux3HeaderTools">
            {selected && props.onSendToUpscale && (
              <IconButton
                title="Send this edit to Video Upscale"
                onClick={() => props.onSendToUpscale?.({ assetId: selected.id, name: selected.title, url: selected.videoUrl })}
              >
                <ScanLine size={15} />
              </IconButton>
            )}
            <span className="flux3HeaderIcon" aria-label="FLUX Video Edit"><PencilLine size={18} /></span>
          </div>
        </PanelHeader>
        {selected ? (
          <VideoComparisonFader beforeUrl={selected.sourceVideoUrl} afterUrl={selected.videoUrl} afterLabel="Edited" />
        ) : source ? (
          <div className="videoEditSourcePreview">
            <video
              className="videoStage"
              style={videoStageStyle(source.width && source.height ? { width: source.width, height: source.height } : null)}
              src={source.source}
              controls
              playsInline
              preload="metadata"
            />
            <div>
              <Film size={16} />
              <strong>{source.name}</strong>
              <span>{sourceMeta(source)}</span>
              <button type="button" onClick={() => setSource(null)} title="Remove source"><X size={14} /></button>
            </div>
          </div>
        ) : (
          <button className="videoEditDrop videoStage" type="button" onClick={() => inputRef.current?.click()}>
            <Upload size={28} />
            <strong>Drop an MP4 or a saved video</strong>
            <span>Maximum 50 MB · 15 seconds · the edit keeps the source length, aspect ratio, and audio · up to 720p</span>
          </button>
        )}
        <input ref={inputRef} hidden type="file" accept="video/mp4,.mp4" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void selectFile(file);
          event.target.value = "";
        }} />
        {selected && (
          <div className="videoEditResultBar">
            <div><strong>{selected.title}</strong><span>{selected.prompt}</span></div>
            <div>
              <button type="button" onClick={() => void editResultAgain(selected)} title="Use this result as the source for the next change">
                <Repeat size={14} />
                Edit again
              </button>
              <a href={`${selected.videoUrl}?download=1`}><Download size={14} />Download</a>
              <button type="button" onClick={props.onOpenAssets}>Assets</button>
            </div>
          </div>
        )}
      </div>
      <aside className="videoEditControls panel controls">
        <PanelHeader title="Edit video" subtitle="One change per pass; edit the result for the next"><PencilLine size={18} /></PanelHeader>
        {/* The video counterpart of a VTO garment slot: one clip, dropped or
            browsed, replaceable while a result stays on the comparison stage. */}
        <div
          className={`videoEditSourceSlot${source ? " active" : ""}${isSlotDropActive ? " dropReady" : ""}`}
          onDragOver={(event) => event.preventDefault()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsSlotDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsSlotDropActive(false);
          }}
          onDrop={(event) => {
            setIsSlotDropActive(false);
            handleDrop(event);
          }}
        >
          <div className="videoEditSlotHeader">
            <span><Film size={13} />Source clip</span>
            {source ? (
              <IconButton title="Clear clip" onClick={() => setSource(null)}><X size={12} /></IconButton>
            ) : (
              <button type="button" className="videoEditSlotAction" onClick={() => inputRef.current?.click()}>Browse</button>
            )}
          </div>
          {source ? (
            <div className="videoEditSlotBody">
              <strong>{source.name}</strong>
              <small>{sourceMeta(source)}</small>
            </div>
          ) : (
            <div className="videoEditSlotEmpty">
              <Upload size={15} />
              <span>Drop an MP4 or a library video</span>
            </div>
          )}
        </div>
        <label>
          Edit instruction
          <textarea
            ref={promptRef}
            rows={5}
            maxLength={VIDEO_EDIT_PROMPT_MAX_CHARS}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Remove the orange bucket. Make the apron red. Add a seagull on the crate…"
          />
        </label>
        <div className="videoEditPromptMeta">
          <span>Everything you don&apos;t mention stays as filmed.</span>
          <span>{promptLength}/{VIDEO_EDIT_PROMPT_MAX_CHARS}</span>
        </div>
        <div className="videoEditStarters" aria-label="Prompt starters">
          {VIDEO_EDIT_PROMPT_STARTERS.map((starter) => (
            <button type="button" key={starter.label} onClick={() => insertStarter(starter.prompt)} title={starter.prompt}>
              {starter.label}
            </button>
          ))}
        </div>
        <label>Safety<select value={safetyTolerance} onChange={(event) => setSafetyTolerance(Number(event.target.value))}>{[0, 1, 2, 3, 4].map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <div className="videoEditOutput">
          <span>Output</span>
          <strong>{source?.duration ? `${source.duration.toFixed(1)} s · same aspect ratio` : "Follows the source"}</strong>
          <small>Same length, aspect ratio, and audio as the source · 24 fps · above 720p is downscaled to 720p</small>
        </div>
        <div className="videoEditCost">
          <span>Estimate</span>
          <strong>{estimatedUsd === null ? "After source metadata" : `$${estimatedUsd.toFixed(2)}`}</strong>
          <small>${VIDEO_EDIT_USD_PER_SECOND.toFixed(2)} per output second</small>
        </div>
        {(error || warning) && <p className={error ? "errorBox" : "flux3Warning"}>{error || warning}</p>}
        <JobQueue queue={props.generationQueue} summary={props.generationQueueSummary} concurrency={props.generationQueueConcurrency} controls={props.generationQueueControls} />
        <RunButton isRunning={isRunning || Boolean(pendingQueueJobId)} onClick={() => void run()} disabled={Boolean(blocker) || Boolean(pendingQueueJobId)} icon={PencilLine}>Edit with FLUX</RunButton>
        {blocker && !error && <p className="flux3Blocker">{blocker}</p>}
      </aside>
    </section>
  );
}
