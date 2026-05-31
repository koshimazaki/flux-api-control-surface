"use client";

import { Activity, Clipboard, Download, Image, Music, Play, Plus, Repeat, RotateCcw, Scissors, Trash2, Upload, Video, Wand2 } from "lucide-react";
import type { ChangeEvent, DragEvent, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeAudioFile, type AudioAnalysisResult, type AudioBandKey, type AudioEventKind, type AudioMarker } from "@/lib/audio-analysis";
import {
  loadCachedAudioFile,
  loadCachedAudioScriptState,
  saveCachedAudioFile,
  saveCachedAudioScriptState,
  type CachedAudioScriptState
} from "@/lib/audio-session-storage";
import {
  bandLabels,
  buildAudioPrompt,
  clamp,
  colorForBand,
  createDefaultShot,
  defaultAudioQualityBoosters,
  defaultAudioSetup,
  drawWaveform,
  eventLabels,
  formatSeconds,
  formatStrength,
  imageOptionsFromSources,
  readImageFile,
  syncShots,
  type AudioShot,
  type ImageOption
} from "@/lib/audio-script";
import { copyText } from "@/lib/clipboard";
import { downloadText } from "@/lib/prompt-utils";
import type { AssetRecord, TrainingCollectionItem } from "@/lib/types";

type AudioScriptPanelProps = {
  assets: AssetRecord[];
  collectionItems: TrainingCollectionItem[];
  onUsePrompt: (prompt: string) => void;
  onOpenImage: (asset: AssetRecord) => void;
};

type AudioExportFormat = "mp3" | "wav";
type VideoTarget = "seedance" | "kling" | "custom";

const videoTargets: Record<VideoTarget, { label: string; imageGuides: number }> = {
  seedance: { label: "Seedance 2.0", imageGuides: 9 },
  kling: { label: "Kling", imageGuides: 6 },
  custom: { label: "Custom", imageGuides: 9 }
};

function isVideoTarget(value: string): value is VideoTarget {
  return value in videoTargets;
}

function shotForCache(shot: AudioShot): AudioShot {
  if (!shot.imageSourceId) return shot;
  return { ...shot, imageDataUrl: "" };
}

function assetRecordFromImage(source: {
  id: string;
  name: string;
  imageDataUrl: string;
  prompt: string;
  model: string;
}): AssetRecord {
  const now = Date.now();
  return {
    id: `audio-preview-${source.id}`,
    title: source.name,
    createdAt: new Date(now).toISOString(),
    timestamp: now,
    imageDataUrl: source.imageDataUrl,
    imageUrl: source.imageDataUrl,
    image_url: source.imageDataUrl,
    sampleUrl: source.imageDataUrl,
    model: source.model,
    prompt: source.prompt,
    status: "complete",
    payload: { source: "audio-script" },
    references: []
  };
}

export function AudioScriptPanel(props: AudioScriptPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sliceOverlayRef = useRef<HTMLDivElement | null>(null);
  const draggingMarkerId = useRef<string | null>(null);
  const draggingSliceHandle = useRef<"start" | "end" | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioDuration, setAudioDuration] = useState(0);
  const [analysis, setAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [markers, setMarkers] = useState<AudioMarker[]>([]);
  const [shots, setShots] = useState<AudioShot[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState("");
  const [startSeconds, setStartSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(15);
  const [sliceStartSeconds, setSliceStartSeconds] = useState(0);
  const [sliceEndSeconds, setSliceEndSeconds] = useState(15);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewLoop, setPreviewLoop] = useState(false);
  const [exportLoopCount, setExportLoopCount] = useState(1);
  const [exportingFormat, setExportingFormat] = useState<AudioExportFormat | "">("");
  const [isRenderingGuide, setIsRenderingGuide] = useState(false);
  const [shotCount, setShotCount] = useState(6);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [videoTarget, setVideoTarget] = useState<VideoTarget>("seedance");
  const [maxImageGuides, setMaxImageGuides] = useState(videoTargets.seedance.imageGuides);
  const [scriptSetup, setScriptSetup] = useState(defaultAudioSetup);
  const [qualityBoosters, setQualityBoosters] = useState(defaultAudioQualityBoosters);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [hasLoadedAudioCache, setHasLoadedAudioCache] = useState(false);
  const imageOptions = useMemo(
    () => imageOptionsFromSources(props.assets, props.collectionItems),
    [props.assets, props.collectionItems]
  );
  const shotRows = markers.map((marker, index) => ({
    marker,
    shot: shots.find((shot) => shot.markerId === marker.id) || createDefaultShot(marker, index)
  }));
  const timelineStart = analysis?.start ?? 0;
  const timelineDuration = analysis?.analyzedDuration || Math.min(audioDuration || durationSeconds, durationSeconds);
  const timelineEnd = timelineStart + timelineDuration;
  const sliceStartPercent = timelineDuration ? clamp(((sliceStartSeconds - timelineStart) / timelineDuration) * 100, 0, 100) : 0;
  const sliceEndPercent = timelineDuration ? clamp(((sliceEndSeconds - timelineStart) / timelineDuration) * 100, 0, 100) : 100;
  const playheadPercent = timelineDuration ? clamp(((currentTime - timelineStart) / timelineDuration) * 100, 0, 100) : 0;
  const sliceDuration = Math.max(0, sliceEndSeconds - sliceStartSeconds);
  const uniqueImageGuideCount = new Set(shots.map((shot) => shot.imageSourceId || shot.imageName).filter(Boolean)).size;
  const estimatedVideoParts = Math.max(1, Math.ceil(uniqueImageGuideCount / Math.max(1, maxImageGuides)));

  useEffect(() => {
    let cancelled = false;

    async function loadCachedAudio() {
      const [file, cached] = await Promise.all([
        loadCachedAudioFile().catch((err) => {
          console.warn("Could not load cached audio file", err);
          return null;
        }),
        Promise.resolve(loadCachedAudioScriptState())
      ]);
      if (cancelled) return;

      if (file) setAudioFile(file);
      if (cached) {
        setAudioDuration(cached.audioDuration || 0);
        setAnalysis(cached.analysis || null);
        setMarkers(cached.markers || []);
        setShots(cached.shots || []);
        setSelectedMarkerId(cached.selectedMarkerId || "");
        setStartSeconds(cached.startSeconds || 0);
        setDurationSeconds(cached.durationSeconds || 15);
        setSliceStartSeconds(cached.sliceStartSeconds || 0);
        setSliceEndSeconds(cached.sliceEndSeconds || 15);
        setCurrentTime(cached.currentTime || 0);
        setPreviewLoop(Boolean(cached.previewLoop));
        setExportLoopCount(cached.exportLoopCount || 1);
        setShotCount(cached.shotCount || 6);
        setVideoTarget(isVideoTarget(cached.videoTarget) ? cached.videoTarget : "seedance");
        setMaxImageGuides(cached.maxImageGuides || videoTargets.seedance.imageGuides);
        setScriptSetup(cached.scriptSetup || defaultAudioSetup);
        setQualityBoosters(cached.qualityBoosters || defaultAudioQualityBoosters);
        setGeneratedPrompt(cached.generatedPrompt || "");
      }
      setHasLoadedAudioCache(true);
    }

    void loadCachedAudio();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!audioFile) {
      setAudioUrl("");
      return;
    }
    const url = URL.createObjectURL(audioFile);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  useEffect(() => {
    if (!hasLoadedAudioCache) return;
    const timeout = window.setTimeout(() => {
      const state: CachedAudioScriptState = {
        fileName: audioFile?.name,
        fileSize: audioFile?.size,
        fileType: audioFile?.type,
        fileLastModified: audioFile?.lastModified,
        audioDuration,
        analysis,
        markers,
        shots: shots.map(shotForCache),
        selectedMarkerId,
        startSeconds,
        durationSeconds,
        sliceStartSeconds,
        sliceEndSeconds,
        currentTime,
        previewLoop,
        exportLoopCount,
        shotCount,
        videoTarget,
        maxImageGuides,
        scriptSetup,
        qualityBoosters,
        generatedPrompt
      };
      saveCachedAudioScriptState(state);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    hasLoadedAudioCache,
    audioFile?.name,
    audioFile?.size,
    audioFile?.type,
    audioFile?.lastModified,
    audioDuration,
    analysis,
    markers,
    shots,
    selectedMarkerId,
    startSeconds,
    durationSeconds,
    sliceStartSeconds,
    sliceEndSeconds,
    currentTime,
    previewLoop,
    exportLoopCount,
    shotCount,
    videoTarget,
    maxImageGuides,
    scriptSetup,
    qualityBoosters,
    generatedPrompt
  ]);

  useEffect(() => {
    if (!hasLoadedAudioCache || !imageOptions.length) return;
    setShots((current) => {
      let changed = false;
      const hydrated = current.map((shot) => {
        if (!shot.imageSourceId || shot.imageDataUrl) return shot;
        const option = imageOptions.find((item) => item.id === shot.imageSourceId);
        if (!option) return shot;
        changed = true;
        return {
          ...shot,
          imageName: shot.imageName || option.name,
          imageDataUrl: option.imageDataUrl,
          imagePrompt: shot.imagePrompt || option.prompt
        };
      });
      return changed ? hydrated : current;
    });
  }, [hasLoadedAudioCache, imageOptions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawWaveform(canvas, analysis, markers, selectedMarkerId);
    redraw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [analysis, markers, selectedMarkerId]);

  function setAudioFiles(files: File[]) {
    const file = files.find((item) => item.type.startsWith("audio/")) || files[0];
    if (!file) return;
    setAudioFile(file);
    saveCachedAudioFile(file).catch((err) => console.warn("Could not persist audio file", err));
    setAudioDuration(0);
    setAnalysis(null);
    setMarkers([]);
    setShots([]);
    setSelectedMarkerId("");
    setSliceStartSeconds(0);
    setSliceEndSeconds(15);
    setCurrentTime(0);
    setPreviewLoop(false);
    setExportingFormat("");
    setGeneratedPrompt("");
    setError("");
  }

  function openImageOption(option: ImageOption) {
    props.onOpenImage(
      assetRecordFromImage({
        id: option.id,
        name: option.name,
        imageDataUrl: option.imageDataUrl,
        prompt: option.prompt,
        model: option.source === "gallery" ? "gallery reference" : "collection reference"
      })
    );
  }

  function openShotImage(shot: AudioShot) {
    if (!shot.imageDataUrl) return;
    props.onOpenImage(
      assetRecordFromImage({
        id: shot.id,
        name: shot.imageName || shot.id,
        imageDataUrl: shot.imageDataUrl,
        prompt: shot.imagePrompt || shot.prompt,
        model: "audio timing image"
      })
    );
  }

  function onAudioInput(event: ChangeEvent<HTMLInputElement>) {
    setAudioFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function updateLoadedAudioDuration(duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) return;
    setAudioDuration(duration);
    setDurationSeconds((current) => clamp(current, 1, Math.min(15, duration)));
    setSliceEndSeconds((current) => clamp(current || Math.min(15, duration), 0.05, duration));
  }

  async function analyzeCurrentAudio() {
    if (!audioFile) {
      setError("Choose an audio file first.");
      return;
    }
    setIsAnalyzing(true);
    setError("");
    try {
      const result = await analyzeAudioFile(audioFile, {
        startSeconds,
        durationSeconds,
        markerCount: shotCount,
        maxDurationSeconds: 15
      });
      setAnalysis(result);
      setMarkers(result.markers);
      setShots((current) => syncShots(result.markers, current));
      setSelectedMarkerId(result.markers[0]?.id || "");
      setSliceStartSeconds(result.start);
      setSliceEndSeconds(result.start + result.analyzedDuration);
      setGeneratedPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze audio.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function updateMarker(markerId: string, patch: Partial<AudioMarker>) {
    setMarkers((current) =>
      current
        .map((marker) => (marker.id === markerId ? { ...marker, ...patch } : marker))
        .sort((left, right) => left.relativeTime - right.relativeTime)
    );
  }

  function moveMarker(markerId: string, relativeTime: number) {
    const duration = analysis?.analyzedDuration || durationSeconds;
    const start = analysis?.start || startSeconds;
    const safeRelativeTime = clamp(relativeTime, 0, duration);
    updateMarker(markerId, {
      relativeTime: safeRelativeTime,
      time: start + safeRelativeTime
    });
  }

  function updateShot(markerId: string, patch: Partial<AudioShot>) {
    setShots((current) =>
      markers.map((marker, index) => {
        const base = current.find((shot) => shot.markerId === marker.id) || createDefaultShot(marker, index);
        return marker.id === markerId ? { ...base, ...patch } : base;
      })
    );
  }

  function assignImage(markerId: string, option: ImageOption) {
    updateShot(markerId, {
      imageSourceId: option.id,
      imageName: option.name,
      imageDataUrl: option.imageDataUrl,
      imagePrompt: option.prompt,
      prompt: shots.find((shot) => shot.markerId === markerId)?.prompt || option.prompt
    });
  }

  async function onRowDrop(markerId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const optionId = event.dataTransfer.getData("application/x-bfl-image-option") || event.dataTransfer.getData("text/plain");
    const option = imageOptions.find((item) => item.id === optionId);
    if (option) {
      assignImage(markerId, option);
      return;
    }
    const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith("image/"));
    if (!file) return;
    const imageDataUrl = await readImageFile(file);
    updateShot(markerId, {
      imageSourceId: "",
      imageName: file.name,
      imageDataUrl,
      imagePrompt: file.name
    });
  }

  function markerAtTime(time: number): AudioMarker {
    const start = timelineStart;
    const relativeTime = clamp(time - start, 0, Math.max(timelineDuration, 0.05));
    const nearestPoint = analysis?.waveform.length
      ? analysis.waveform.reduce((best, point) =>
          Math.abs(point.time - relativeTime) < Math.abs(best.time - relativeTime) ? point : best
        )
      : undefined;
    const low = nearestPoint?.low ?? 0.5;
    const mid = nearestPoint?.mid ?? 0.4;
    const high = nearestPoint?.high ?? 0.25;
    const band: AudioBandKey = low >= mid && low >= high ? "low" : high >= mid ? "high" : "mid";
    const kind: AudioEventKind = band === "low" ? "kick" : band === "mid" ? "snare" : "hat";
    return {
      id: `manual-${Date.now()}-${Math.round(relativeTime * 1000)}`,
      time: start + relativeTime,
      relativeTime,
      kind,
      band,
      amplitude: nearestPoint?.amplitude ?? nearestPoint?.peak ?? 0.5,
      low,
      mid,
      high,
      confidence: 0.72
    };
  }

  function addTimingSpot() {
    const baseTime = currentTime > 0 ? currentTime : Math.min(sliceEndSeconds, (markers[markers.length - 1]?.time ?? timelineStart) + 1);
    const marker = markerAtTime(baseTime);
    setMarkers((current) => [...current, marker].sort((left, right) => left.relativeTime - right.relativeTime));
    setShots((current) => [...current, createDefaultShot(marker, current.length)]);
    setSelectedMarkerId(marker.id);
    setShotCount((current) => Math.max(current, markers.length + 1));
    setGeneratedPrompt("");
  }

  function removeTimingSpot(markerId: string) {
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setShots((current) => current.filter((shot) => shot.markerId !== markerId));
    setSelectedMarkerId((current) => {
      if (current !== markerId) return current;
      return markers.find((marker) => marker.id !== markerId)?.id || "";
    });
    setGeneratedPrompt("");
  }

  function relativeTimeFromPointer(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return 0;
    const rect = canvas.getBoundingClientRect();
    return clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * analysis.analyzedDuration, 0, analysis.analyzedDuration);
  }

  function nearestMarkerId(event: PointerEvent<HTMLCanvasElement>) {
    if (!analysis || !markers.length) return "";
    const relativeTime = relativeTimeFromPointer(event);
    return markers.reduce((best, marker) =>
      Math.abs(marker.relativeTime - relativeTime) < Math.abs(best.relativeTime - relativeTime) ? marker : best
    ).id;
  }

  function onWaveformPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (!analysis || !markers.length) return;
    const markerId = nearestMarkerId(event) || selectedMarkerId || markers[0].id;
    draggingMarkerId.current = markerId;
    setSelectedMarkerId(markerId);
    moveMarker(markerId, relativeTimeFromPointer(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onWaveformPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!draggingMarkerId.current) return;
    moveMarker(draggingMarkerId.current, relativeTimeFromPointer(event));
  }

  function onWaveformPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    draggingMarkerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function updateSliceBoundary(boundary: "start" | "end", value: number) {
    const maxTime = audioDuration || Math.max(timelineEnd, sliceEndSeconds, 15);
    if (boundary === "start") {
      setSliceStartSeconds(clamp(value, 0, Math.max(0, sliceEndSeconds - 0.05)));
      return;
    }
    setSliceEndSeconds(clamp(value, Math.min(maxTime, sliceStartSeconds + 0.05), maxTime));
  }

  function timeFromSlicePointer(event: PointerEvent<HTMLElement>) {
    const rect = sliceOverlayRef.current?.getBoundingClientRect();
    if (!rect || !timelineDuration) return timelineStart;
    return timelineStart + clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1) * timelineDuration;
  }

  function onSliceHandlePointerDown(boundary: "start" | "end", event: PointerEvent<HTMLButtonElement>) {
    draggingSliceHandle.current = boundary;
    updateSliceBoundary(boundary, timeFromSlicePointer(event));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onSliceHandlePointerMove(boundary: "start" | "end", event: PointerEvent<HTMLButtonElement>) {
    if (draggingSliceHandle.current !== boundary) return;
    updateSliceBoundary(boundary, timeFromSlicePointer(event));
  }

  function onSliceHandlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    draggingSliceHandle.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function playSlice() {
    if (!audioRef.current) return;
    audioRef.current.currentTime = sliceStartSeconds;
    setCurrentTime(sliceStartSeconds);
    void audioRef.current.play();
  }

  function onAudioTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (!previewLoop || sliceEndSeconds <= sliceStartSeconds) return;
    if (audio.currentTime >= sliceEndSeconds || audio.currentTime < sliceStartSeconds) {
      audio.currentTime = sliceStartSeconds;
      setCurrentTime(sliceStartSeconds);
      void audio.play();
    }
  }

  function exportFileName(format: AudioExportFormat) {
    const baseName = (audioFile?.name || "audio-slice")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "audio-slice";
    return `${baseName}_${formatSeconds(sliceStartSeconds, 2)}-${formatSeconds(sliceEndSeconds, 2)}_${exportLoopCount}x.${format}`;
  }

  async function exportAudioSlice(format: AudioExportFormat) {
    if (!audioFile) {
      setError("Choose an audio file first.");
      return;
    }
    if (sliceEndSeconds <= sliceStartSeconds) {
      setError("Slice end must be after slice start.");
      return;
    }
    setExportingFormat(format);
    setError("");
    try {
      const form = new FormData();
      form.append("audio", audioFile);
      form.append("start", sliceStartSeconds.toFixed(3));
      form.append("end", sliceEndSeconds.toFixed(3));
      form.append("loopCount", String(exportLoopCount));
      form.append("format", format);
      const response = await fetch("/api/audio/slice", {
        method: "POST",
        body: form
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not export audio slice.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exportFileName(format);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export audio slice.");
    } finally {
      setExportingFormat("");
    }
  }

  function guideVideoFileName(blob: Blob) {
    const baseName = (audioFile?.name || "audio-reactive-guide")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "audio-reactive-guide";
    return `${baseName}_shader-guide_${formatSeconds(timelineStart, 2)}-${formatSeconds(timelineEnd, 2)}.mp4`;
  }

  async function exportAudioGuideVideo() {
    if (!analysis) {
      setError("Analyze an audio segment before exporting a guide video.");
      return;
    }
    setIsRenderingGuide(true);
    setError("");
    try {
      const response = await fetch("/api/audio/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis,
          markers,
          width: 960,
          height: 540,
          fps: 30,
          bpm: 60,
          beatsPerBar: 4
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Could not export shader guide video.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = guideVideoFileName(blob);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export shader guide video.");
    } finally {
      setIsRenderingGuide(false);
    }
  }

  function generatePrompt() {
    const prompt = buildAudioPrompt(analysis, markers, shots, {
      setup: scriptSetup,
      qualityBoosters,
      targetModel: videoTargets[videoTarget].label,
      maxImageGuides,
      videoGuidance: true,
      guideBpm: 60,
      guideBeatsPerBar: 4
    });
    setGeneratedPrompt(prompt);
    return prompt;
  }

  function updateVideoTarget(value: VideoTarget) {
    setVideoTarget(value);
    if (value !== "custom") setMaxImageGuides(videoTargets[value].imageGuides);
  }

  function resetAudioScript() {
    setAnalysis(null);
    setMarkers([]);
    setShots([]);
    setSelectedMarkerId("");
    setGeneratedPrompt("");
    setError("");
  }

  return (
    <section className="assetsPanel audioScriptPanel">
      <div className="panelHeader">
        <div>
          <h2>Audio Script</h2>
          <p>{analysis ? `${markers.length} timing bars from ${formatSeconds(analysis.analyzedDuration)}s` : "Waveform, spectral hits, and shot timing"}</p>
        </div>
        <div className="assetActions">
          <label className="fileButton">
            <Upload size={16} />
            Audio
            <input type="file" accept="audio/*" onChange={onAudioInput} />
          </label>
          <button onClick={() => void analyzeCurrentAudio()} disabled={!audioFile || isAnalyzing}>
            <Play size={16} />
            {isAnalyzing ? "Analyzing" : "Analyze"}
          </button>
          <button onClick={resetAudioScript} disabled={!analysis && !markers.length}>
            <RotateCcw size={16} />
            Reset
          </button>
          <button onClick={() => void copyText(generatedPrompt || generatePrompt())} disabled={!markers.length}>
            <Clipboard size={16} />
            Copy
          </button>
          <button
            onClick={() => downloadText("audio-shot-script.txt", generatedPrompt || generatePrompt(), "text/plain")}
            disabled={!markers.length}
          >
            <Download size={16} />
            TXT
          </button>
        </div>
      </div>

      <div
        className="audioDropzone"
        onDrop={(event) => {
          event.preventDefault();
          setAudioFiles(Array.from(event.dataTransfer.files || []));
        }}
        onDragOver={(event) => event.preventDefault()}
      >
        <Music size={18} />
        <span>{audioFile?.name || "Audio file"}</span>
        {audioUrl && (
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            onLoadedMetadata={(event) => {
              updateLoadedAudioDuration(event.currentTarget.duration);
              setCurrentTime(event.currentTarget.currentTime);
            }}
            onPlay={() => {
              if (previewLoop && audioRef.current && audioRef.current.currentTime < sliceStartSeconds) {
                audioRef.current.currentTime = sliceStartSeconds;
                setCurrentTime(sliceStartSeconds);
              }
            }}
            onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
            onTimeUpdate={onAudioTimeUpdate}
          />
        )}
      </div>

      <div className="audioControls">
        <label>
          Analyze start
          <input type="number" min={0} step={0.1} value={startSeconds} onChange={(event) => setStartSeconds(Number(event.target.value) || 0)} />
        </label>
        <label>
          Analyze length
          <input
            type="number"
            min={1}
            max={15}
            step={0.5}
            value={durationSeconds}
            onChange={(event) => setDurationSeconds(clamp(Number(event.target.value) || 15, 1, 15))}
          />
        </label>
        <label>
          Bars
          <input
            type="number"
            min={1}
            max={24}
            step={1}
            value={shotCount}
            onChange={(event) => setShotCount(clamp(Number(event.target.value) || 6, 1, 24))}
          />
        </label>
      </div>

      <div className="audioSliceControls">
        <label>
          Start bracket
          <input
            type="number"
            min={0}
            max={Math.max(sliceEndSeconds - 0.05, 0)}
            step={0.01}
            value={formatSeconds(sliceStartSeconds, 2)}
            onChange={(event) => updateSliceBoundary("start", Number(event.target.value) || 0)}
          />
        </label>
        <label>
          End bracket
          <input
            type="number"
            min={sliceStartSeconds + 0.05}
            max={audioDuration || undefined}
            step={0.01}
            value={formatSeconds(sliceEndSeconds, 2)}
            onChange={(event) => updateSliceBoundary("end", Number(event.target.value) || 0)}
          />
        </label>
        <label>
          Loops
          <input
            type="number"
            min={1}
            max={64}
            step={1}
            value={exportLoopCount}
            onChange={(event) => setExportLoopCount(clamp(Math.round(Number(event.target.value) || 1), 1, 64))}
          />
        </label>
        <label className="toggle audioLoopToggle">
          <input type="checkbox" checked={previewLoop} onChange={(event) => setPreviewLoop(event.target.checked)} />
          Loop preview
        </label>
        <button onClick={playSlice} disabled={!audioUrl}>
          <Scissors size={16} />
          Play slice
        </button>
        <button onClick={() => void exportAudioSlice("mp3")} disabled={!audioFile || Boolean(exportingFormat)}>
          <Download size={16} />
          {exportingFormat === "mp3" ? "MP3..." : "MP3"}
        </button>
        <button onClick={() => void exportAudioSlice("wav")} disabled={!audioFile || Boolean(exportingFormat)}>
          <Download size={16} />
          {exportingFormat === "wav" ? "WAV..." : "WAV"}
        </button>
        <button onClick={() => void exportAudioGuideVideo()} disabled={!analysis || isRenderingGuide}>
          <Video size={16} />
          {isRenderingGuide ? "Guide..." : "Guide MP4"}
        </button>
        <small>
          {formatSeconds(sliceDuration, 2)}s x {exportLoopCount}
        </small>
      </div>

      {error && <p className="errorText">{error}</p>}

      <div className="audioWaveformShell">
        <canvas
          ref={canvasRef}
          className="audioWaveformCanvas"
          onPointerDown={onWaveformPointerDown}
          onPointerMove={onWaveformPointerMove}
          onPointerUp={onWaveformPointerUp}
        />
        <div className="audioSliceOverlay" ref={sliceOverlayRef}>
          <div
            className="audioSliceWindow"
            style={{
              left: `${Math.min(sliceStartPercent, sliceEndPercent)}%`,
              width: `${Math.max(0, sliceEndPercent - sliceStartPercent)}%`
            }}
          />
          <button
            className="audioSliceHandle start"
            style={{ left: `${sliceStartPercent}%` }}
            onPointerDown={(event) => onSliceHandlePointerDown("start", event)}
            onPointerMove={(event) => onSliceHandlePointerMove("start", event)}
            onPointerUp={onSliceHandlePointerUp}
            title="Drag start bracket"
          />
          <button
            className="audioSliceHandle end"
            style={{ left: `${sliceEndPercent}%` }}
            onPointerDown={(event) => onSliceHandlePointerDown("end", event)}
            onPointerMove={(event) => onSliceHandlePointerMove("end", event)}
            onPointerUp={onSliceHandlePointerUp}
            title="Drag end bracket"
          />
          <div className="audioPlayhead" style={{ left: `${playheadPercent}%` }}>
            <span>{formatSeconds(currentTime, 2)}s</span>
          </div>
        </div>
        <div className="audioLegend">
          <span><i className="low" />Low</span>
          <span><i className="mid" />Mid</span>
          <span><i className="high" />High</span>
          <span><Activity size={13} />Amplitude</span>
          <span><Repeat size={13} />{formatSeconds(sliceStartSeconds, 2)}s-{formatSeconds(sliceEndSeconds, 2)}s</span>
          <span>Now {formatSeconds(currentTime, 2)}s</span>
        </div>
      </div>

      <div className="audioScriptGrid">
        <div className="audioShotList">
          <div className="runLogHeader audioShotListHeader">
            <span>Timing spots</span>
            <div>
              <small>{markers.length} rows</small>
              <button onClick={addTimingSpot}>
                <Plus size={15} />
                Add spot
              </button>
            </div>
          </div>
          {shotRows.map(({ marker, shot }, index) => (
            <article
              className={marker.id === selectedMarkerId ? "audioShotRow selected" : "audioShotRow"}
              key={marker.id}
              onClick={() => setSelectedMarkerId(marker.id)}
              onDrop={(event) => void onRowDrop(marker.id, event)}
              onDragOver={(event) => event.preventDefault()}
            >
              <div className="audioShotMeta">
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <input
                  type="number"
                  min={analysis?.start || 0}
                  max={(analysis?.start || 0) + (analysis?.analyzedDuration || durationSeconds)}
                  step={0.01}
                  value={formatSeconds(marker.time, 2)}
                  onChange={(event) => moveMarker(marker.id, (Number(event.target.value) || 0) - (analysis?.start || startSeconds))}
                />
                <small>{formatStrength(marker.confidence)}</small>
                <button onClick={() => removeTimingSpot(marker.id)} title="Remove timing spot">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="audioShotImage">
                {shot.imageDataUrl ? (
                  <button
                    type="button"
                    className="audioShotImageButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      openShotImage(shot);
                    }}
                    title="Open image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shot.imageDataUrl} alt={shot.imageName || shot.id} />
                  </button>
                ) : (
                  <Image size={18} />
                )}
                <span>{shot.imageName || "Image"}</span>
              </div>
              <div className="audioShotFields">
                <div className="audioShotSelects">
                  <select
                    value={marker.kind}
                    onChange={(event) => updateMarker(marker.id, { kind: event.target.value as AudioEventKind })}
                  >
                    {Object.entries(eventLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <select
                    value={marker.band}
                    onChange={(event) => updateMarker(marker.id, { band: event.target.value as AudioBandKey })}
                  >
                    {Object.entries(bandLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <span style={{ color: colorForBand(marker.band) }}>
                    L {formatStrength(marker.low)} / M {formatStrength(marker.mid)} / H {formatStrength(marker.high)}
                  </span>
                </div>
                <textarea
                  value={shot.prompt}
                  onChange={(event) => updateShot(marker.id, { prompt: event.target.value })}
                  placeholder="Beat action prompt"
                />
                <textarea
                  className="audioImagePromptInput"
                  value={shot.imagePrompt}
                  onChange={(event) => updateShot(marker.id, { imagePrompt: event.target.value })}
                  placeholder="@img source prompt/caption"
                />
              </div>
            </article>
          ))}
          {!markers.length && <div className="emptyState">Analyze an audio segment to create timing rows.</div>}
        </div>

        <aside className="audioPoolPanel">
          <div className="runLogHeader">
            <span>Image pool</span>
            <small>{imageOptions.length} refs</small>
          </div>
          <div className="audioImagePool">
            {imageOptions.map((option) => (
              <article
                className="audioImagePoolItem"
                key={option.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/x-bfl-image-option", option.id);
                  event.dataTransfer.setData("text/plain", option.id);
                }}
                title={option.name}
              >
                <button type="button" className="audioImagePreviewButton" onClick={() => openImageOption(option)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={option.imageDataUrl} alt={option.name} />
                  <span>{option.name}</span>
                </button>
                <button
                  type="button"
                  className="audioImageAssignButton"
                  onClick={() => selectedMarkerId && assignImage(selectedMarkerId, option)}
                  disabled={!selectedMarkerId}
                  title="Assign to selected timing spot"
                >
                  <Plus size={13} />
                  <span>{option.source}</span>
                </button>
              </article>
            ))}
            {!imageOptions.length && <div className="scriptEmpty">Gallery and collection images appear here.</div>}
          </div>
        </aside>
      </div>

      <div className="audioPromptComposer">
        <div className="audioPromptGuides">
          <div className="audioModelGuideControls">
            <label>
              Video target
              <select value={videoTarget} onChange={(event) => updateVideoTarget(event.target.value as VideoTarget)}>
                <option value="seedance">Seedance 2.0</option>
                <option value="kling">Kling</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Image guides
              <input
                type="number"
                min={1}
                max={24}
                step={1}
                value={maxImageGuides}
                onChange={(event) => {
                  setVideoTarget("custom");
                  setMaxImageGuides(clamp(Math.round(Number(event.target.value) || 1), 1, 24));
                }}
              />
            </label>
            <small>
              {uniqueImageGuideCount} used refs to {estimatedVideoParts} video{estimatedVideoParts === 1 ? "" : "s"}
            </small>
          </div>
          <label>
            Setup
            <textarea value={scriptSetup} onChange={(event) => setScriptSetup(event.target.value)} />
          </label>
          <label>
            Style & quality boosters
            <textarea value={qualityBoosters} onChange={(event) => setQualityBoosters(event.target.value)} />
          </label>
        </div>
        <div className="runLogHeader">
          <span>Generated prompt</span>
          <div>
            <button onClick={generatePrompt} disabled={!markers.length}>
              <Wand2 size={15} />
              Generate
            </button>
            <button onClick={() => props.onUsePrompt(generatedPrompt || generatePrompt())} disabled={!markers.length}>
              <Clipboard size={15} />
              Use prompt
            </button>
          </div>
        </div>
        <textarea value={generatedPrompt} onChange={(event) => setGeneratedPrompt(event.target.value)} placeholder="Audio shot script" />
      </div>
    </section>
  );
}
