import type { AudioMarker } from "@/lib/audio-analysis";
import { loadCachedAudioScriptState, type CachedAudioScriptState } from "@/lib/audio-session-storage";

/**
 * Audio Script -> Video Script timing template.
 *
 * The Audio Script panel already persists its markers, shots, and locked marker
 * ids through `audio-session-storage`, so this bridge reads that cache rather
 * than reaching into the panel's React state. It is a first-class Video Script
 * input, not an export-only afterthought, and it stays pure: the caller passes
 * the cached state in, and only `readAudioScriptMarkerSource` touches storage.
 */

export type AudioMarkerImportKind = "beat" | "transition" | "locked";

export type AudioMarkerSource = {
  markers: AudioMarker[];
  /** Marker ids that begin a shot; these are the visual transition points. */
  transitionMarkerIds: string[];
  lockedMarkerIds: string[];
  /** Where the analysed slice starts, so imported times are relative to it. */
  sliceStartSeconds: number;
};

export type AudioMarkerImportOptions = {
  kind: AudioMarkerImportKind;
  /** Keyframe positions to fill. More markers than slots are sampled evenly. */
  keyframeCount: number;
  /** Row duration; times past it are dropped rather than silently clamped. */
  duration: number | "auto";
};

export type AudioMarkerImportResult = {
  seconds: number[];
  /** Markers that matched the selected kind before sampling or filtering. */
  matched: number;
  /** Markers dropped for falling outside the duration or repeating a time. */
  dropped: number;
  note: string;
};

const KIND_LABELS: Record<AudioMarkerImportKind, string> = {
  beat: "beat",
  transition: "transition",
  locked: "locked"
};

/** Reads the Audio Script browser cache. Returns null when that tab is unused. */
export function readAudioScriptMarkerSource(): AudioMarkerSource | null {
  let cached: (CachedAudioScriptState & { lockedMarkerIds?: string[] }) | null = null;
  try {
    cached = loadCachedAudioScriptState();
  } catch {
    return null;
  }
  if (!cached || !Array.isArray(cached.markers) || !cached.markers.length) return null;
  return {
    markers: cached.markers,
    transitionMarkerIds: Array.isArray(cached.shots) ? cached.shots.map((shot) => shot.markerId).filter(Boolean) : [],
    lockedMarkerIds: Array.isArray(cached.lockedMarkerIds) ? cached.lockedMarkerIds : [],
    sliceStartSeconds: typeof cached.sliceStartSeconds === "number" ? cached.sliceStartSeconds : 0
  };
}

function markersForKind(source: AudioMarkerSource, kind: AudioMarkerImportKind) {
  if (kind === "locked") {
    const locked = new Set(source.lockedMarkerIds);
    return source.markers.filter((marker) => locked.has(marker.id));
  }
  if (kind === "transition") {
    const transitions = new Set(source.transitionMarkerIds);
    return source.markers.filter((marker) => transitions.has(marker.id));
  }
  return source.markers;
}

/** Picks `count` entries spread evenly across the list, keeping both ends. */
function sampleEvenly<T>(items: T[], count: number) {
  if (count <= 0) return [];
  if (items.length <= count) return items.slice();
  if (count === 1) return [items[0]];
  return Array.from({ length: count }, (_, index) => items[Math.round((index * (items.length - 1)) / (count - 1))]);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Maps selected marker times onto keyframe timestamps. The result is relative
 * to the analysed slice, strictly increasing, and inside the row duration —
 * the same rules the planner validates a timing template against.
 */
export function audioMarkerTimingTemplate(
  source: AudioMarkerSource,
  options: AudioMarkerImportOptions
): AudioMarkerImportResult {
  const label = KIND_LABELS[options.kind];
  const matched = markersForKind(source, options.kind);
  if (!matched.length) {
    return { seconds: [], matched: 0, dropped: 0, note: `No ${label} markers are available in the Audio Script cache.` };
  }

  const limit = typeof options.duration === "number" && Number.isFinite(options.duration) ? options.duration : Infinity;
  const ordered = matched
    .map((marker) => round(Math.max(0, marker.time - source.sliceStartSeconds)))
    .sort((left, right) => left - right);

  const inRange = ordered.filter((seconds) => seconds <= limit);
  const sampled = sampleEvenly(inRange, Math.max(1, Math.trunc(options.keyframeCount)));

  // Strictly increasing is a hard planner rule, so equal times collapse.
  const seconds: number[] = [];
  for (const value of sampled) {
    if (seconds.length && value <= seconds[seconds.length - 1]) continue;
    seconds.push(value);
  }

  const dropped = matched.length - seconds.length;
  const note = seconds.length
    ? `Imported ${seconds.length} of ${matched.length} ${label} ${matched.length === 1 ? "marker" : "markers"}${
        dropped > 0 ? ` (${dropped} outside the duration or duplicated)` : ""
      }.`
    : `Every ${label} marker falls outside the ${options.duration}s duration.`;
  return { seconds, matched: matched.length, dropped: Math.max(0, dropped), note };
}
