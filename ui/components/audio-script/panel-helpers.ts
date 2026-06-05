import { formatSeconds, type AudioShot } from "@/lib/audio-script";
import type { AudioAnalysisResult, AudioMarker } from "@/lib/audio-analysis";
import type { AssetRecord } from "@/lib/types";
import type { AudioExportFormat, VideoTarget } from "./types";

export const MIN_WAVEFORM_ZOOM = 1;
export const MAX_WAVEFORM_ZOOM = 16;

export const videoTargets: Record<VideoTarget, { label: string; imageGuides: number }> = {
  seedance: { label: "Seedance 2.0", imageGuides: 9 },
  kling: { label: "Kling", imageGuides: 6 },
  custom: { label: "Custom", imageGuides: 9 }
};

export function isVideoTarget(value: string): value is VideoTarget {
  return value in videoTargets;
}

export function shotForCache(shot: AudioShot): AudioShot {
  if (!shot.imageSourceId) return shot;
  return { ...shot, imageDataUrl: "" };
}

export function assetRecordFromImage(source: {
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

export function formatClock(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function sanitizeBaseName(name: string | undefined, fallback: string) {
  return (name || fallback)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

export function exportSliceFileName(
  fileName: string | undefined,
  sliceStartSeconds: number,
  sliceEndSeconds: number,
  exportLoopCount: number,
  format: AudioExportFormat
) {
  const baseName = sanitizeBaseName(fileName, "audio-slice");
  return `${baseName}_${formatSeconds(sliceStartSeconds, 2)}-${formatSeconds(sliceEndSeconds, 2)}_${exportLoopCount}x.${format}`;
}

export function exportGuideFileName(
  fileName: string | undefined,
  timelineStart: number,
  timelineEnd: number
) {
  const baseName = sanitizeBaseName(fileName, "audio-reactive-guide");
  return `${baseName}_shader-guide_${formatSeconds(timelineStart, 2)}-${formatSeconds(timelineEnd, 2)}.mp4`;
}

export function decorateLockedMarkers(
  canvas: HTMLCanvasElement | null,
  analysis: AudioAnalysisResult | null,
  markers: AudioMarker[],
  lockedMarkerIds: Set<string>
) {
  if (!canvas || !analysis || !analysis.analyzedDuration || !lockedMarkerIds.size) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  const height = canvas.clientHeight || 0;
  if (!width || !height) return;
  context.save();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(232, 184, 96, 0.92)";
  context.setLineDash([5, 4]);
  markers.forEach((marker) => {
    if (!lockedMarkerIds.has(marker.id)) return;
    const x = (marker.relativeTime / analysis.analyzedDuration) * width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  });
  context.restore();
}
