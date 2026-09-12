import { flux3Recreation, type RecreationSeed } from "@/lib/asset-recreation";
import { Download, Film, PencilLine, ScanLine, Sparkles, Video, WandSparkles, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Flux3MediaDropzone, type Flux3InputMedia } from "@/components/flux3-media-dropzone";
import { IconButton } from "@/components/ui/icon-button";
import { JobQueue, type JobQueueControls } from "@/components/ui/job-queue";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import { CubeLoader } from "@/components/ui/cube-loader";
import type { VideoEditSourceInput } from "@/lib/video-edit";
import { usePauseHiddenMedia } from "@/lib/use-pause-hidden-media";
import { videoAspectFromEvent, videoStageStyle, type VideoStageAspect } from "@/lib/video-stage";
import type { VideoUpscaleSourceInput } from "@/lib/video-upscale";
import type { GenerationQueueJob, GenerationQueueSummary } from "@/lib/generation-queue";
import {
  FLUX3_ASPECT_RATIOS,
  estimateFlux3VideoUsd,
  flux3MaxDuration,
  flux3RequestBlocker,
  type Flux3VideoAspectRatio,
  type Flux3VideoMode,
  type Flux3VideoRequest,
  type Flux3VideoResolution,
  type Flux3VideoResult,
  type Flux3SourceMode
} from "@/lib/flux3-video";
import type { AssetRecord } from "@/lib/types";

type Flux3VideoWorkspaceProps = {
  /** False while another video tool is on screen: this one stays mounted but hidden. */
  active: boolean;
  recreation?: RecreationSeed | null;
  apiKey: string;
  assets: AssetRecord[];
  mode: Flux3SourceMode;
  onModeChange: (mode: Flux3SourceMode) => void;
  keyframes: Flux3InputMedia[];
  onKeyframesChange: (items: Flux3InputMedia[]) => void;
  startVideo: Flux3InputMedia | null;
  onStartVideoChange: (media: Flux3InputMedia | null) => void;
  /** Prompt pushed from a library video card; the nonce re-applies repeat sends. */
  promptSeed?: { text: string; nonce: number } | null;
  /** Sends the selected render to the Video Edit workspace. */
  onSendToEdit?: (source: VideoEditSourceInput) => void;
  /** Sends the selected render to the Video Upscale workspace. */
  onSendToUpscale?: (source: VideoUpscaleSourceInput) => void;
  onGenerated: () => void;
  onOpenAssets: () => void;
  // FLUX 3 renders share the one server-owned queue with image and tool work, so
  // this workspace shows the same compact queue summary as the other panels.
  generationQueue: GenerationQueueJob[];
  generationQueueSummary: GenerationQueueSummary;
  generationQueueConcurrency: number;
  generationQueueControls?: JobQueueControls;
  /** Selected Video Library prompt; selecting another saved prompt loads it here. */
  libraryPrompt?: string;
};

// The source mode (Text / Frames / Continue) is chosen from the video tool rail
// above the workspace; this panel only names the active one.
function formatMode(mode: Flux3VideoMode) {
  if (mode === "t2v") return "Text to video";
  if (mode === "i2v") return "Image to video";
  if (mode === "v2v") return "Video continuation";
  return "Draft enhancement";
}

function durationOptions(max: number) {
  return Array.from({ length: max - 4 }, (_, index) => index + 5);
}

export function Flux3VideoWorkspace(props: Flux3VideoWorkspaceProps) {
  const mode = props.mode;
  const [prompt, setPrompt] = useState("");
  const keyframes = props.keyframes;
  const startVideo = props.startVideo;
  const setStartVideo = props.onStartVideoChange;
  const [aspectRatio, setAspectRatio] = useState<Flux3VideoAspectRatio>("auto");
  const [duration, setDuration] = useState<number | "auto">("auto");
  const [resolution, setResolution] = useState<Flux3VideoResolution>("hd");
  const [generateAudio, setGenerateAudio] = useState(true);
  const [safetyTolerance, setSafetyTolerance] = useState(2);
  const [draft, setDraft] = useState(true);
  const [results, setResults] = useState<Flux3VideoResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runLabel, setRunLabel] = useState("Generating draft");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  // A long render outlives the HTTP wrapper's wait budget. The job is still
  // running on the server queue, so this must never read as a failure — that
  // would invite a second paid Generate for work already in flight.
  const [pendingQueueJobId, setPendingQueueJobId] = useState<string | null>(null);
  // The selected render sizes the stage; an empty stage keeps the 16:9 default.
  const [stageAspect, setStageAspect] = useState<VideoStageAspect | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  usePauseHiddenMedia(rootRef, props.active);
  const selected = results.find((item) => item.id === selectedId) || results[0] || null;
  const maxDuration = flux3MaxDuration(mode);

  function updateKeyframes(items: Flux3InputMedia[]) {
    if (items.length > keyframes.length) props.onModeChange("i2v");
    props.onKeyframesChange(items);
  }

  useEffect(() => {
    if (props.libraryPrompt?.trim()) setPrompt(props.libraryPrompt);
  }, [props.libraryPrompt]);

  useEffect(() => {
    if (props.promptSeed?.text.trim()) setPrompt(props.promptSeed.text);
  }, [props.promptSeed]);

  useEffect(() => {
    if (!props.recreation || ["video-edit", "video-upscale"].includes(props.recreation.recipe.operation)) return;
    const restored = flux3Recreation(props.recreation.recipe);
    setPrompt(restored.prompt); setAspectRatio(restored.aspectRatio); setDuration(restored.duration);
    setResolution(restored.resolution); setGenerateAudio(restored.generateAudio);
    setSafetyTolerance(restored.safetyTolerance); setDraft(restored.draft); setError("");
  }, [props.recreation]);

  const requestInput = useMemo<Flux3VideoRequest>(
    () => ({
      mode,
      prompt,
      keyframes: keyframes.map((item) => item.source),
      timedKeyframes: keyframes.length && keyframes.every(item => typeof item.seconds === "number")
        ? keyframes.map(item => [item.seconds!, item.source]) : undefined,
      startVideo: startVideo?.source,
      aspectRatio,
      duration,
      resolution,
      generateAudio,
      safetyTolerance,
      draft
    }),
    [aspectRatio, draft, duration, generateAudio, keyframes, mode, prompt, resolution, safetyTolerance, startVideo]
  );
  const blocker = mode === "i2v" && keyframes.some(frame => !frame.source) ? "Replace the missing saved keyframe before generating." : flux3RequestBlocker(requestInput);
  const estimatedUsd = estimateFlux3VideoUsd(requestInput);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bfl/flux3-video", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()).results as Flux3VideoResult[]) : []))
      .then((items) => {
        if (cancelled) return;
        setResults(items);
        setSelectedId((current) => current || items[0]?.id || null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // While a render is still on the server queue, follow that specific job. A
  // plain "is there a new video?" scan would adopt an unrelated concurrent
  // render and would never release the UI if this job failed or was cancelled.
  useEffect(() => {
    if (!pendingQueueJobId) return;
    let cancelled = false;

    async function adoptSavedVideo(resultAssetId?: string) {
      const response = await fetch("/api/bfl/flux3-video", { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const items = ((await response.json()).results || []) as Flux3VideoResult[];
      if (cancelled || !items.length) return;
      setResults((current) => {
        const known = new Set(current.map((item) => item.id));
        const match = resultAssetId ? items.find((item) => item.id === resultAssetId) : undefined;
        // Prefer this job's own output; fall back to the newest unseen render.
        const adopted = match || items.find((item) => !known.has(item.id));
        if (!adopted) return current;
        setSelectedId(adopted.id);
        return [adopted, ...current.filter((item) => item.id !== adopted.id)];
      });
      props.onGenerated();
    }

    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/dashboard/queue?id=${encodeURIComponent(pendingQueueJobId)}`, {
          cache: "no-store"
        });
        if (cancelled) return;
        if (response.status === 404) {
          // The job record was cleared; fall back to the newest saved render.
          // Adopt first — clearing the pending id unmounts this effect and
          // would cancel the adoption fetch mid-flight.
          await adoptSavedVideo();
          setPendingQueueJobId(null);
          setWarning("");
          return;
        }
        if (!response.ok) return;
        const job = (await response.json()).job as
          | { status?: string; error?: string; resultAssetId?: string }
          | undefined;
        if (cancelled || !job?.status) return;

        if (job.status === "complete") {
          await adoptSavedVideo(job.resultAssetId);
          setPendingQueueJobId(null);
          setWarning("");
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          setPendingQueueJobId(null);
          setWarning("");
          setError(
            job.error ||
              (job.status === "cancelled" ? "The render was cancelled." : "The queued FLUX 3 render failed.")
          );
        }
      } catch {
        // Transient read failure; the next tick retries.
      }
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingQueueJobId, props]);

  useEffect(() => {
    if (typeof duration === "number" && duration > maxDuration) setDuration(maxDuration);
    if (mode !== "t2v" && safetyTolerance > 2) setSafetyTolerance(2);
  }, [duration, maxDuration, mode, safetyTolerance]);

  async function submit(input: Flux3VideoRequest, title: string, label: string) {
    const requestBlocker = flux3RequestBlocker(input);
    if (requestBlocker) {
      setError(requestBlocker);
      return;
    }
    setError("");
    setWarning("");
    setRunLabel(label);
    setIsRunning(true);
    try {
      const response = await fetch("/api/bfl/flux3-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, keyframeAssetIds: keyframes.map(item => item.assetId || ""), startVideoAssetId: startVideo?.assetId, apiKey: props.apiKey || undefined, title })
      });
      const data = await response.json();
      if (!response.ok) {
        // The wrapper stopped waiting, but the queue kept the job. Report it as
        // in-progress rather than as a failure.
        const queueJobId = data?.details?.queueJobId;
        if (queueJobId) {
          setPendingQueueJobId(String(queueJobId));
          setWarning(
            "Still rendering on the server queue — this is taking longer than the request window. The video is saved automatically when it finishes; there is no need to generate again."
          );
          return;
        }
        throw new Error(data.error || "FLUX 3 video generation failed.");
      }
      const next = data as Flux3VideoResult & { warning?: string | null };
      setResults((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setSelectedId(next.id);
      if (next.warning) setWarning(next.warning);
      props.onGenerated();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "FLUX 3 video generation failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function generate() {
    const title = prompt.trim().slice(0, 72) || `FLUX 3 ${mode}`;
    void submit(requestInput, title, draft ? "Generating draft" : "Rendering video");
  }

  function enhanceSelected() {
    if (!selected?.draftCacheAvailable) return;
    void submit(
      {
        mode: "draft_enhance",
        draftCacheId: selected.id,
        resolution: "fhd",
        safetyTolerance: Math.min(safetyTolerance, 2)
      },
      `${selected.title} enhanced`,
      "Enhancing selected draft"
    );
  }

  return (
    <section className="flux3VideoWorkspace" ref={rootRef} hidden={!props.active}>
      <div className="flux3PreviewPanel panel">
        <PanelHeader title="FLUX 3 Video" subtitle="Synchronized picture, speech, effects, and ambience in one request">
          <div className="flux3HeaderTools">
            {selected && props.onSendToEdit && (
              <IconButton
                title="Send this render to Video Edit"
                onClick={() => props.onSendToEdit?.({ assetId: selected.id, name: selected.title, url: selected.videoUrl })}
              >
                <PencilLine size={15} />
              </IconButton>
            )}
            {selected && props.onSendToUpscale && (
              <IconButton
                title="Send this render to Video Upscale"
                onClick={() => props.onSendToUpscale?.({ assetId: selected.id, name: selected.title, url: selected.videoUrl })}
              >
                <ScanLine size={15} />
              </IconButton>
            )}
            <span className="flux3HeaderIcon" title="FLUX 3 video workspace" aria-label="FLUX 3 video workspace">
              <Video size={18} />
            </span>
          </div>
        </PanelHeader>
        <div
          className="flux3Viewer videoStage"
          data-loading={selected && viewerLoading ? "true" : undefined}
          style={videoStageStyle(stageAspect)}
        >
          {selected ? (
            <video
              key={selected.videoUrl}
              src={selected.videoUrl}
              controls
              playsInline
              preload="metadata"
              onLoadStart={() => setViewerLoading(true)}
              onLoadedData={() => setViewerLoading(false)}
              onCanPlay={() => setViewerLoading(false)}
              onError={() => setViewerLoading(false)}
              onLoadedMetadata={(event) => setStageAspect(videoAspectFromEvent(event))}
            />
          ) : (
            <div className="flux3ViewerEmpty">
              <Film size={38} />
              <strong>Your FLUX 3 render will play here</strong>
              <span>Draft first, select the shot, then enhance it without reinterpreting the generation.</span>
            </div>
          )}
          {(isRunning || pendingQueueJobId) && (
            <div className="flux3RenderOverlay">
              <CubeLoader />
              <strong>{pendingQueueJobId ? "Still rendering on the server queue" : runLabel}</strong>
              <span>
                {pendingQueueJobId
                  ? "The server keeps working with this tab closed. The video appears here and in Assets as soon as it is saved."
                  : "FLUX 3 video jobs usually take a minute or two. The result is downloaded locally as soon as it is ready."}
              </span>
            </div>
          )}
        </div>
        {selected && (
          <div className="flux3ResultBar">
            <div>
              <strong>{selected.title}</strong>
              <span>{formatMode(selected.mode)} · {selected.duration === "auto" ? "auto duration" : `${selected.duration}s`} · {selected.resolution?.toUpperCase()}</span>
            </div>
            <div>
              {selected.draft && selected.draftCacheAvailable && (
                <button type="button" onClick={enhanceSelected} disabled={isRunning}>
                  <WandSparkles size={14} />
                  Enhance to FHD
                </button>
              )}
              <a href={`${selected.videoUrl}?download=1`}>
                <Download size={14} />
                Download
              </a>
              <button type="button" onClick={props.onOpenAssets}>Assets</button>
            </div>
          </div>
        )}
        <Flux3MediaDropzone
          mode={mode}
          assets={props.assets}
          keyframes={keyframes}
          startVideo={startVideo}
          onKeyframesChange={updateKeyframes}
          onStartVideoChange={setStartVideo}
          onError={setError}
        />
      </div>

      <aside className="flux3Controls panel controls">
        <PanelHeader title="Create video" subtitle={`FLUX 3 · ${formatMode(mode)}`}>
          <Film size={18} aria-label="FLUX 3 video creation" />
        </PanelHeader>
        <label>
          Video prompt
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={7}
            placeholder={mode === "v2v" ? "Describe the next beat, camera motion, dialogue, sound, and ambience…" : "Describe action, camera, dialogue, sound, and scene changes…"}
          />
        </label>
        <div className="flux3SettingsGrid">
          <label>
            Duration
            <select value={duration} onChange={(event) => setDuration(event.target.value === "auto" ? "auto" : Number(event.target.value))}>
              <option value="auto">Auto</option>
              {durationOptions(maxDuration).map((seconds) => <option value={seconds} key={seconds}>{seconds} sec</option>)}
            </select>
          </label>
          <label>
            Aspect
            <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as Flux3VideoAspectRatio)}>
              {FLUX3_ASPECT_RATIOS.map((ratio) => <option value={ratio} key={ratio}>{ratio === "auto" ? "Auto" : ratio}</option>)}
            </select>
          </label>
          <label>
            Resolution
            <select value={resolution} onChange={(event) => setResolution(event.target.value as Flux3VideoResolution)} disabled={draft}>
              <option value="hd">HD</option>
              <option value="fhd">FHD</option>
            </select>
          </label>
          <label>
            Safety
            <select value={safetyTolerance} onChange={(event) => setSafetyTolerance(Number(event.target.value))}>
              {Array.from({ length: mode === "t2v" ? 5 : 3 }, (_, value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
        </div>
        <label className="toggle flux3Toggle">
          <input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} />
          {generateAudio ? <Volume2 size={16} /> : <VolumeX size={16} />}
          Synchronized audio
        </label>
        <label className="toggle flux3Toggle">
          <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
          <WandSparkles size={16} />
          Draft first
        </label>
        <div className="flux3CostBox">
          <div><span>Render</span><strong>{draft ? "Draft · HD" : resolution.toUpperCase()}</strong></div>
          <div><span>Estimate</span><strong>{estimatedUsd === null ? "After duration" : `$${estimatedUsd.toFixed(2)}`}</strong></div>
          <small>{draft ? "Drafts can be enhanced later with the same shot and seed." : "Full render pricing scales with final duration."}</small>
        </div>
        {(error || warning) && <p className={error ? "errorBox" : "flux3Warning"}>{error || warning}</p>}
        <JobQueue
          queue={props.generationQueue}
          summary={props.generationQueueSummary}
          concurrency={props.generationQueueConcurrency}
          controls={props.generationQueueControls}
        />
        <RunButton
          isRunning={isRunning || Boolean(pendingQueueJobId)}
          onClick={generate}
          disabled={Boolean(blocker) || Boolean(pendingQueueJobId)}
          icon={Film}
        >
          {draft ? "Generate draft" : "Render FLUX 3 video"}
        </RunButton>
        {blocker && !error && <p className="flux3Blocker">{blocker}</p>}
      </aside>
    </section>
  );
}
