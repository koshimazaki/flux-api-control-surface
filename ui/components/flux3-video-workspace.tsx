import { Download, Film, Images, MessageSquareText, Sparkles, Video, WandSparkles, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Flux3MediaDropzone, type Flux3InputMedia } from "@/components/flux3-media-dropzone";
import { JobQueue, type JobQueueControls } from "@/components/ui/job-queue";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
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
  type Flux3VideoResult
} from "@/lib/flux3-video";
import type { AssetRecord } from "@/lib/types";

type Flux3VideoWorkspaceProps = {
  apiKey: string;
  assets: AssetRecord[];
  keyframes: Flux3InputMedia[];
  onKeyframesChange: (items: Flux3InputMedia[]) => void;
  onGenerated: () => void;
  onOpenAssets: () => void;
  // FLUX.3 renders share the one server-owned queue with image and tool work, so
  // this workspace shows the same compact queue summary as the other panels.
  generationQueue: GenerationQueueJob[];
  generationQueueSummary: GenerationQueueSummary;
  generationQueueConcurrency: number;
  generationQueueControls?: JobQueueControls;
};

const modeOptions: Array<{ id: Exclude<Flux3VideoMode, "draft_enhance">; label: string; detail: string; icon: typeof Film }> = [
  { id: "t2v", label: "Text", detail: "Prompt → video", icon: MessageSquareText },
  { id: "i2v", label: "Images", detail: "1–10 frames", icon: Images },
  { id: "v2v", label: "Continue", detail: "MP4 → next clip", icon: Video }
];

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
  const [mode, setMode] = useState<Exclude<Flux3VideoMode, "draft_enhance">>("t2v");
  const [prompt, setPrompt] = useState("");
  const keyframes = props.keyframes;
  const [startVideo, setStartVideo] = useState<Flux3InputMedia | null>(null);
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
  const selected = results.find((item) => item.id === selectedId) || results[0] || null;
  const maxDuration = flux3MaxDuration(mode);

  const requestInput = useMemo<Flux3VideoRequest>(
    () => ({
      mode,
      prompt,
      keyframes: keyframes.map((item) => item.source),
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
  const blocker = flux3RequestBlocker(requestInput);
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
          setPendingQueueJobId(null);
          setWarning("");
          await adoptSavedVideo();
          return;
        }
        if (!response.ok) return;
        const job = (await response.json()).job as
          | { status?: string; error?: string; resultAssetId?: string }
          | undefined;
        if (cancelled || !job?.status) return;

        if (job.status === "complete") {
          setPendingQueueJobId(null);
          setWarning("");
          await adoptSavedVideo(job.resultAssetId);
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          setPendingQueueJobId(null);
          setWarning("");
          setError(
            job.error ||
              (job.status === "cancelled" ? "The render was cancelled." : "The queued FLUX.3 render failed.")
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
        body: JSON.stringify({ ...input, apiKey: props.apiKey || undefined, title })
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
        throw new Error(data.error || "FLUX.3 video generation failed.");
      }
      const next = data as Flux3VideoResult & { warning?: string | null };
      setResults((current) => [next, ...current.filter((item) => item.id !== next.id)]);
      setSelectedId(next.id);
      if (next.warning) setWarning(next.warning);
      props.onGenerated();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "FLUX.3 video generation failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function generate() {
    const title = prompt.trim().slice(0, 72) || `FLUX.3 ${mode}`;
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
    <section className="flux3VideoWorkspace">
      <div className="flux3PreviewPanel panel">
        <PanelHeader title="FLUX.3 Video" subtitle="Synchronized picture, speech, effects, and ambience in one request">
          <span className="flux3EndpointBadge">POST /v1/flux-3-video</span>
        </PanelHeader>
        <div className="flux3Viewer">
          {selected ? (
            <video key={selected.videoUrl} src={selected.videoUrl} controls playsInline preload="metadata" />
          ) : (
            <div className="flux3ViewerEmpty">
              <Film size={38} />
              <strong>Your FLUX.3 render will play here</strong>
              <span>Draft first, select the shot, then enhance it without reinterpreting the generation.</span>
            </div>
          )}
          {(isRunning || pendingQueueJobId) && (
            <div className="flux3RenderOverlay">
              <Sparkles className="spin" size={24} />
              <strong>{pendingQueueJobId ? "Still rendering on the server queue" : runLabel}</strong>
              <span>
                {pendingQueueJobId
                  ? "The server keeps working with this tab closed. The video appears here and in Assets as soon as it is saved."
                  : "FLUX.3 video jobs usually take a minute or two. The result is downloaded locally as soon as it is ready."}
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
          onKeyframesChange={props.onKeyframesChange}
          onStartVideoChange={setStartVideo}
          onError={setError}
        />
      </div>

      <aside className="flux3Controls panel controls">
        <PanelHeader title="Create video" subtitle="Choose what the model starts from" />
        <div className="flux3ModePicker">
          {modeOptions.map(({ id, label, detail, icon: Icon }) => (
            <button type="button" className={mode === id ? "active" : ""} key={id} onClick={() => setMode(id)}>
              <Icon size={16} />
              <span><strong>{label}</strong><small>{detail}</small></span>
            </button>
          ))}
        </div>
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
          {draft ? "Generate draft" : "Render FLUX.3 video"}
        </RunButton>
        {blocker && !error && <p className="flux3Blocker">{blocker}</p>}
      </aside>
    </section>
  );
}
