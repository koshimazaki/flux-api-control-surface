"use client";

import type { ChangeEvent, DragEvent, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeAudioFile, type AudioAnalysisResult, type AudioBandKey, type AudioEventKind, type AudioMarker } from "@/lib/audio-analysis";
import { saveCachedAudioFile } from "@/lib/audio-session-storage";
import {
  buildAudioPrompt,
  clamp,
  createDefaultShot,
  defaultAudioQualityBoosters,
  defaultAudioSetup,
  defaultMotionPrompt,
  drawWaveform,
  formatSeconds,
  imageOptionsFromSources,
  isDefaultMotionPrompt,
  readImageFile,
  syncShots,
  type AudioShot,
  type ImageOption
} from "@/lib/audio-script";
import { copyText } from "@/lib/clipboard";
import { downloadText } from "@/lib/prompt-utils";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import {
  MAX_WAVEFORM_ZOOM,
  MIN_WAVEFORM_ZOOM,
  assetRecordFromImage,
  decorateLockedMarkers,
  exportGuideFileName,
  exportSliceFileName,
  videoTargets
} from "@/components/audio-script/panel-helpers";
import { AudioScriptPanelView } from "@/components/audio-script/panel-view";
import type { AudioExportFormat, AudioScriptPanelProps, VideoTarget } from "@/components/audio-script/types";
import { useAudioScriptCache } from "@/components/audio-script/use-audio-script-cache";

export function AudioScriptPanel(props: AudioScriptPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveformTrackRef = useRef<HTMLDivElement | null>(null);
  const sliceOverlayRef = useRef<HTMLDivElement | null>(null);
  const draggingMarkerId = useRef<string | null>(null);
  const draggingSliceHandle = useRef<"start" | "end" | null>(null);
  const rafRef = useRef<number | null>(null);
  const playheadFrameRef = useRef<() => void>(() => {});
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
  const [isPlaying, setIsPlaying] = useState(false);
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
  const [zoom, setZoom] = useState(1);
  const [lockedMarkerIds, setLockedMarkerIds] = useState<Set<string>>(() => new Set());
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);
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
  const selectedMarkerLocked = Boolean(selectedMarkerId) && lockedMarkerIds.has(selectedMarkerId);

  playheadFrameRef.current = () => {
    const audio = audioRef.current;
    if (!audio) {
      rafRef.current = null;
      return;
    }
    if (previewLoop && sliceEndSeconds > sliceStartSeconds && audio.currentTime >= sliceEndSeconds) {
      audio.currentTime = sliceStartSeconds;
    }
    setCurrentTime(audio.currentTime);
    if (!audio.paused && !audio.ended) {
      rafRef.current = requestAnimationFrame(() => playheadFrameRef.current());
    } else {
      rafRef.current = null;
    }
  };

  useAudioScriptCache(
    {
      audioFile, audioDuration, analysis, markers, shots, selectedMarkerId,
      startSeconds, durationSeconds, sliceStartSeconds, sliceEndSeconds, currentTime,
      previewLoop, exportLoopCount, shotCount, videoTarget, maxImageGuides,
      scriptSetup, qualityBoosters, generatedPrompt, lockedMarkerIds
    },
    {
      setAudioFile, setAudioDuration, setAnalysis, setMarkers, setShots, setSelectedMarkerId,
      setLockedMarkerIds, setStartSeconds, setDurationSeconds, setSliceStartSeconds,
      setSliceEndSeconds, setCurrentTime, setPreviewLoop, setExportLoopCount, setShotCount,
      setVideoTarget, setMaxImageGuides, setScriptSetup, setQualityBoosters, setGeneratedPrompt
    },
    imageOptions
  );

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => {
      drawWaveform(canvas, analysis, markers, selectedMarkerId);
      decorateLockedMarkers(canvas, analysis, markers, lockedMarkerIds);
    };
    redraw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  }, [analysis, markers, selectedMarkerId, lockedMarkerIds, zoom]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  useEffect(() => {
    if (!startFocused) setStartDraft(formatSeconds(sliceStartSeconds, 2));
  }, [sliceStartSeconds, startFocused]);

  useEffect(() => {
    if (!endFocused) setEndDraft(formatSeconds(sliceEndSeconds, 2));
  }, [sliceEndSeconds, endFocused]);

  const { onAssignmentsChange } = props;
  useEffect(() => {
    // report which gallery assets hold @img tokens so the gallery can badge them
    // (token numbering follows marker order, matching single-part prompts)
    const assignments: Record<string, string> = {};
    let tokenCount = 0;
    markers.forEach((marker) => {
      const shot = shots.find((item) => item.markerId === marker.id);
      const sourceId = shot?.imageSourceId || "";
      if (!sourceId.startsWith("asset:")) return;
      const assetId = sourceId.slice("asset:".length);
      if (assignments[assetId]) return;
      tokenCount += 1;
      assignments[assetId] = `@img${tokenCount}`;
    });
    onAssignmentsChange(assignments);
  }, [markers, shots, onAssignmentsChange]);

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
    setLockedMarkerIds(new Set());
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
      setLockedMarkerIds(new Set());
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
    const index = markers.findIndex((marker) => marker.id === markerId);
    const previous = markers[index];
    if (!previous) return;
    const updated = { ...previous, ...patch };
    if (updated.kind !== previous.kind || updated.band !== previous.band) {
      // keep untouched default motion prompts in sync with the new kind/band
      setShots((current) =>
        current.map((shot) =>
          shot.markerId === markerId && (!shot.prompt.trim() || isDefaultMotionPrompt(shot.prompt))
            ? { ...shot, prompt: defaultMotionPrompt(updated, index) }
            : shot
        )
      );
    }
    setMarkers((current) =>
      current
        .map((marker) => (marker.id === markerId ? { ...marker, ...patch } : marker))
        .sort((left, right) => left.relativeTime - right.relativeTime)
    );
    setGeneratedPrompt("");
  }

  function nearestWaveformPoint(relativeTime: number) {
    if (!analysis?.waveform.length) return undefined;
    return analysis.waveform.reduce((best, point) =>
      Math.abs(point.time - relativeTime) < Math.abs(best.time - relativeTime) ? point : best
    );
  }

  function moveMarker(markerId: string, relativeTime: number) {
    if (lockedMarkerIds.has(markerId)) return;
    const duration = analysis?.analyzedDuration || durationSeconds;
    const start = analysis?.start || startSeconds;
    const safeRelativeTime = clamp(relativeTime, 0, duration);
    const nearestPoint = nearestWaveformPoint(safeRelativeTime);
    updateMarker(markerId, {
      relativeTime: safeRelativeTime,
      time: start + safeRelativeTime,
      ...(nearestPoint
        ? {
            amplitude: nearestPoint.amplitude ?? nearestPoint.peak,
            low: nearestPoint.low,
            mid: nearestPoint.mid,
            high: nearestPoint.high
          }
        : {})
    });
  }

  function toggleMarkerLock() {
    if (!selectedMarkerId) return;
    setLockedMarkerIds((current) => {
      const next = new Set(current);
      if (next.has(selectedMarkerId)) {
        next.delete(selectedMarkerId);
      } else {
        next.add(selectedMarkerId);
      }
      return next;
    });
  }

  function zoomWaveform(direction: 1 | -1) {
    setZoom((current) => clamp(direction > 0 ? current * 2 : current / 2, MIN_WAVEFORM_ZOOM, MAX_WAVEFORM_ZOOM));
  }

  function updateShot(markerId: string, patch: Partial<AudioShot>) {
    setShots((current) =>
      markers.map((marker, index) => {
        const base = current.find((shot) => shot.markerId === marker.id) || createDefaultShot(marker, index);
        return marker.id === markerId ? { ...base, ...patch } : base;
      })
    );
    setGeneratedPrompt("");
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
    const optionId = event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) || event.dataTransfer.getData("text/plain");
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
    const nearestPoint = nearestWaveformPoint(relativeTime);
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
    setLockedMarkerIds((current) => {
      if (!current.has(markerId)) return current;
      const next = new Set(current);
      next.delete(markerId);
      return next;
    });
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
    setSelectedMarkerId(markerId);
    if (lockedMarkerIds.has(markerId)) return;
    draggingMarkerId.current = markerId;
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

  function commitSliceDraft(boundary: "start" | "end") {
    if (boundary === "start") {
      const parsed = parseFloat(startDraft);
      updateSliceBoundary("start", startDraft.trim() !== "" && !Number.isNaN(parsed) ? parsed : timelineStart || 0);
      setStartFocused(false);
      return;
    }
    const parsedEnd = parseFloat(endDraft);
    if (endDraft.trim() !== "" && !Number.isNaN(parsedEnd)) updateSliceBoundary("end", parsedEnd);
    setEndFocused(false);
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

  function startPlayheadLoop() {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => playheadFrameRef.current());
  }

  function stopPlayheadLoop() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function playSlice() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = sliceStartSeconds;
    setCurrentTime(sliceStartSeconds);
    void audio.play();
    startPlayheadLoop();
  }

  function onAudioTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    // Lightweight fallback; the requestAnimationFrame loop is the primary playhead driver.
    if (rafRef.current == null) setCurrentTime(audio.currentTime);
  }

  function handleAudioLoadedMetadata(duration: number, time: number) {
    updateLoadedAudioDuration(duration);
    setCurrentTime(time);
  }

  function handleAudioPlay() {
    if (previewLoop && audioRef.current && audioRef.current.currentTime < sliceStartSeconds) {
      audioRef.current.currentTime = sliceStartSeconds;
      setCurrentTime(sliceStartSeconds);
    }
    setIsPlaying(true);
    startPlayheadLoop();
  }

  function handleAudioPause() {
    setIsPlaying(false);
    stopPlayheadLoop();
  }

  function handleAudioEnded() {
    setIsPlaying(false);
    stopPlayheadLoop();
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const safeSeconds = clamp(seconds, 0, audioDuration || audio.duration || seconds);
    audio.currentTime = safeSeconds;
    setCurrentTime(safeSeconds);
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
      anchor.download = exportSliceFileName(audioFile?.name, sliceStartSeconds, sliceEndSeconds, exportLoopCount, format);
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export audio slice.");
    } finally {
      setExportingFormat("");
    }
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
      anchor.download = exportGuideFileName(audioFile?.name, timelineStart, timelineEnd);
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
    setGeneratedPrompt("");
  }

  function updateMaxImageGuides(value: number) {
    setMaxImageGuides(value);
    setGeneratedPrompt("");
  }

  function updateScriptSetup(value: string) {
    setScriptSetup(value);
    setGeneratedPrompt("");
  }

  function updateQualityBoosters(value: string) {
    setQualityBoosters(value);
    setGeneratedPrompt("");
  }

  function resetAudioScript() {
    setAnalysis(null);
    setMarkers([]);
    setShots([]);
    setSelectedMarkerId("");
    setLockedMarkerIds(new Set());
    setGeneratedPrompt("");
    setError("");
  }

  return (
    <AudioScriptPanelView
      audioRef={audioRef}
      canvasRef={canvasRef}
      waveformTrackRef={waveformTrackRef}
      sliceOverlayRef={sliceOverlayRef}
      audioFileName={audioFile?.name}
      audioUrl={audioUrl}
      audioDuration={audioDuration}
      analysis={analysis}
      markers={markers}
      shotRows={shotRows}
      selectedMarkerId={selectedMarkerId}
      lockedMarkerIds={lockedMarkerIds}
      startSeconds={startSeconds}
      durationSeconds={durationSeconds}
      sliceStartSeconds={sliceStartSeconds}
      sliceEndSeconds={sliceEndSeconds}
      currentTime={currentTime}
      isPlaying={isPlaying}
      previewLoop={previewLoop}
      exportLoopCount={exportLoopCount}
      exportingFormat={exportingFormat}
      isRenderingGuide={isRenderingGuide}
      shotCount={shotCount}
      isAnalyzing={isAnalyzing}
      error={error}
      videoTarget={videoTarget}
      maxImageGuides={maxImageGuides}
      scriptSetup={scriptSetup}
      qualityBoosters={qualityBoosters}
      generatedPrompt={generatedPrompt}
      zoom={zoom}
      startDraft={startDraft}
      endDraft={endDraft}
      imageOptions={imageOptions}
      sliceStartPercent={sliceStartPercent}
      sliceEndPercent={sliceEndPercent}
      playheadPercent={playheadPercent}
      sliceDuration={sliceDuration}
      uniqueImageGuideCount={uniqueImageGuideCount}
      estimatedVideoParts={estimatedVideoParts}
      selectedMarkerLocked={selectedMarkerLocked}
      onAudioInput={onAudioInput}
      onAnalyze={() => void analyzeCurrentAudio()}
      onReset={resetAudioScript}
      onCopy={() => void copyText(generatedPrompt || generatePrompt())}
      onDownload={() => downloadText("audio-shot-script.txt", generatedPrompt || generatePrompt(), "text/plain")}
      onDropFiles={setAudioFiles}
      onLoadedMetadata={handleAudioLoadedMetadata}
      onPlay={handleAudioPlay}
      onPause={handleAudioPause}
      onEnded={handleAudioEnded}
      onSeeked={setCurrentTime}
      onTimeUpdate={onAudioTimeUpdate}
      onTogglePlayback={togglePlayback}
      onSeek={seekTo}
      onSetStartSeconds={setStartSeconds}
      onSetDurationSeconds={setDurationSeconds}
      onSetShotCount={setShotCount}
      onSetStartDraft={setStartDraft}
      onSetEndDraft={setEndDraft}
      onSetStartFocused={setStartFocused}
      onSetEndFocused={setEndFocused}
      onCommitSliceDraft={commitSliceDraft}
      onSetExportLoopCount={setExportLoopCount}
      onSetPreviewLoop={setPreviewLoop}
      onPlaySlice={playSlice}
      onExportSlice={(format) => void exportAudioSlice(format)}
      onExportGuide={() => void exportAudioGuideVideo()}
      onZoom={zoomWaveform}
      onToggleMarkerLock={toggleMarkerLock}
      onWaveformPointerDown={onWaveformPointerDown}
      onWaveformPointerMove={onWaveformPointerMove}
      onWaveformPointerUp={onWaveformPointerUp}
      onSliceHandlePointerDown={onSliceHandlePointerDown}
      onSliceHandlePointerMove={onSliceHandlePointerMove}
      onSliceHandlePointerUp={onSliceHandlePointerUp}
      onSelectMarker={setSelectedMarkerId}
      onRowDrop={onRowDrop}
      onAddTimingSpot={addTimingSpot}
      onRemoveTimingSpot={removeTimingSpot}
      onMoveMarker={moveMarker}
      onUpdateMarker={updateMarker}
      onUpdateShot={updateShot}
      onOpenShotImage={openShotImage}
      onOpenImageOption={openImageOption}
      onAssignImage={assignImage}
      onUpdateVideoTarget={updateVideoTarget}
      onSetVideoTarget={setVideoTarget}
      onSetMaxImageGuides={updateMaxImageGuides}
      onSetScriptSetup={updateScriptSetup}
      onSetQualityBoosters={updateQualityBoosters}
      onSetGeneratedPrompt={setGeneratedPrompt}
      onGeneratePrompt={generatePrompt}
      onUsePrompt={props.onUsePrompt}
      onSavePrompt={props.onSavePrompt}
    />
  );
}
