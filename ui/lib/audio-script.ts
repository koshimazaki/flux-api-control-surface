import type { AudioAnalysisResult, AudioBandKey, AudioEventKind, AudioMarker } from "@/lib/audio-analysis";
import type { AssetRecord, TrainingCollectionItem } from "@/lib/types";

export type ImageOption = {
  id: string;
  name: string;
  imageDataUrl: string;
  prompt: string;
  source: "gallery" | "collection";
};

export type AudioShot = {
  id: string;
  markerId: string;
  imageSourceId: string;
  imageName: string;
  imageDataUrl: string;
  imagePrompt: string;
  prompt: string;
};

export const bandLabels: Record<AudioBandKey, string> = {
  low: "Low",
  mid: "Mid",
  high: "High"
};

export const eventLabels: Record<AudioEventKind, string> = {
  kick: "Kick",
  snare: "Snare",
  hat: "Hat",
  beat: "Beat"
};

export const defaultAudioSetup =
  "Audio-guided cinematic sequence. Use the reference images as visual anchors, cut or shift shots on the detected audio impacts, and preserve continuity between beats. Each image should feel alive: it breathes in on impact, breathes out between beats, and moves with subtle organic parallax.";

export const defaultAudioQualityBoosters =
  "Photorealistic 8K, ultra-detailed textures, cinematic lighting, perfect motion blur, high dynamic range, no artifacts, movie-level realism, stable character and scene consistency throughout.";

type BuildAudioPromptOptions = {
  setup?: string;
  qualityBoosters?: string;
  targetModel?: string;
  maxImageGuides?: number;
  videoGuidance?: boolean;
  guideBpm?: number;
  guideBeatsPerBar?: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatSeconds(value: number, digits = 2) {
  return value.toFixed(digits);
}

export function formatStrength(value: number) {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

export function colorForBand(band: AudioBandKey) {
  if (band === "low") return "#9fb09d";
  if (band === "mid") return "#b9b5d0";
  return "#dedbc9";
}

export function defaultMotionPrompt(marker: Pick<AudioMarker, "kind" | "band">, index: number) {
  const prefix = `${String(index + 1).padStart(2, "0")} ${eventLabels[marker.kind]} cut`;
  if (marker.kind === "kick" || marker.band === "low") {
    return `${prefix}: the image breathes in hard on the bass hit, expands from the center, then breathes out with a slow recoil; deep camera push-in, heavy organic pulse, subtle lens shake.`;
  }
  if (marker.kind === "snare" || marker.band === "mid") {
    return `${prefix}: the image snaps open on the snare, petals and tendrils breach forward, then breathe out into a controlled settling motion; crisp side shift and tactile parallax.`;
  }
  if (marker.kind === "hat" || marker.band === "high") {
    return `${prefix}: the image flickers and inhales in tiny high-frequency ripples, surface details shimmer, then exhale back into place; quick micro-zoom and fine particle motion.`;
  }
  return `${prefix}: the image breathes in with the beat and breathes out over the tail, slowly drifting with layered parallax and a smooth cinematic camera move.`;
}

// Cover every kind x band combination defaultMotionPrompt can emit, including
// analyzer-produced "beat" markers, so an untouched default is always detected.
const DEFAULT_MOTION_KINDS: AudioEventKind[] = ["kick", "snare", "hat", "beat"];
const DEFAULT_MOTION_BANDS: AudioBandKey[] = ["low", "mid", "high"];
const DEFAULT_MOTION_BODIES = new Set(
  DEFAULT_MOTION_KINDS.flatMap((kind) =>
    DEFAULT_MOTION_BANDS.map((band) => defaultMotionPrompt({ kind, band }, 0).replace(/^\d+ /, ""))
  )
);

export function isDefaultMotionPrompt(prompt: string) {
  return DEFAULT_MOTION_BODIES.has(prompt.replace(/^\d+ /, ""));
}

function motionCueForMarker(marker: AudioMarker, imageToken: string, index: number) {
  const target = imageToken || "the active image";
  if (marker.kind === "kick" || marker.band === "low") {
    return `Image motion: ${target} breaches into frame and breathes in on the kick, center mass swelling outward with a heavy bass pulse; then it breathes out, retracting slowly while the camera pushes closer.`;
  }
  if (marker.kind === "snare" || marker.band === "mid") {
    return `Image motion: ${target} snaps and opens on the snare, tendrils/petals flexing outward, then breathes out into a clean recoil with sideways parallax and a short camera whip.`;
  }
  if (marker.kind === "hat" || marker.band === "high") {
    return `Image motion: ${target} shivers with tiny high-band ripples, sparkling edges fluttering in and out, then settles back with a quick breath and micro-zoom.`;
  }
  return `Image motion: ${target} breathes in on beat ${index + 1}, drifts forward with soft parallax, then breathes out and relaxes before the next timing cue.`;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function sourceTextFromPrompt(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return collectStrings(JSON.parse(trimmed)).join(" ");
  } catch {
    return trimmed;
  }
}

function compactWords(value: string, maxWords: number) {
  const words = value
    .replace(/\s+/g, " ")
    .replace(/[{}[\]"]/g, "")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function visualCueFromPrompt(raw: string, fallback: string) {
  const source = sourceTextFromPrompt(raw);
  if (!source) return fallback;
  return compactWords(source, 34);
}

function transitionCue(currentCue: string, nextCue: string, nextToken: string) {
  if (!nextToken || !nextCue || nextCue === currentCue) return "";
  return `By the end of this range, begin morphing toward ${nextToken}: ${nextCue}.`;
}

function referenceKeyForShot(shot?: AudioShot) {
  return shot?.imageSourceId || shot?.imageName || shot?.id || "";
}

export function createDefaultShot(marker: AudioMarker, index: number): AudioShot {
  return {
    id: `shot-${marker.id}`,
    markerId: marker.id,
    imageSourceId: "",
    imageName: "",
    imageDataUrl: "",
    imagePrompt: "",
    prompt: defaultMotionPrompt(marker, index)
  };
}

export function syncShots(markers: AudioMarker[], current: AudioShot[]) {
  return markers.map((marker, index) => {
    const existing = current.find((shot) => shot.markerId === marker.id) || current[index];
    if (!existing) return createDefaultShot(marker, index);
    return {
      ...existing,
      markerId: marker.id,
      id: existing.id || `shot-${marker.id}`,
      imagePrompt: existing.imagePrompt || "",
      prompt:
        !existing.prompt.trim() || isDefaultMotionPrompt(existing.prompt)
          ? defaultMotionPrompt(marker, index)
          : existing.prompt
    };
  });
}

export function imageOptionsFromSources(assets: AssetRecord[], collectionItems: TrainingCollectionItem[]) {
  const gallery = assets.map((asset): ImageOption => ({
    id: `asset:${asset.id}`,
    name: asset.title || asset.id,
    imageDataUrl: asset.imageDataUrl,
    prompt: asset.prompt,
    source: "gallery"
  }));
  const collection = collectionItems.map((item): ImageOption => ({
    id: `collection:${item.id}`,
    name: item.name,
    imageDataUrl: item.imageDataUrl,
    prompt: item.caption || item.prompt || "",
    source: "collection"
  }));
  return [...gallery, ...collection].filter((item) => item.imageDataUrl).slice(0, 80);
}

export function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

export function buildAudioPrompt(
  analysis: AudioAnalysisResult | null,
  markers: AudioMarker[],
  shots: AudioShot[],
  options: BuildAudioPromptOptions = {}
) {
  const source = analysis?.fileName || "audio";
  const start = analysis?.start ?? 0;
  const duration = analysis?.analyzedDuration ?? 0;
  const setup = options.setup?.trim() || defaultAudioSetup;
  const qualityBoosters = options.qualityBoosters?.trim() || defaultAudioQualityBoosters;
  const maxImageGuides = clamp(Math.round(options.maxImageGuides || 9), 1, 24);
  const videoGuidance = options.videoGuidance !== false;
  const guideBpm = clamp(Math.round(options.guideBpm || 60), 30, 240);
  const guideBeatsPerBar = clamp(Math.round(options.guideBeatsPerBar || 4), 2, 8);
  const guideBeatSeconds = 60 / guideBpm;
  const markerRows = markers.map((marker, index) => ({
    marker,
    index,
    shot: shots.find((item) => item.markerId === marker.id)
  }));
  const parts: typeof markerRows[] = [];
  let currentPart: typeof markerRows = [];
  let currentKeys = new Set<string>();

  markerRows.forEach((row) => {
    const key = referenceKeyForShot(row.shot);
    const wouldAddKey = key && !currentKeys.has(key);
    if (currentPart.length && wouldAddKey && currentKeys.size >= maxImageGuides) {
      parts.push(currentPart);
      currentPart = [];
      currentKeys = new Set<string>();
    }
    currentPart.push(row);
    if (key) currentKeys.add(key);
  });
  if (currentPart.length) parts.push(currentPart);

  function buildPart(partRows: typeof markerRows, partIndex: number) {
    const referenceKeys = new Map<string, string>();
    const referenceLines: string[] = [];
    partRows.forEach(({ shot }) => {
      if (!shot?.imageName && !shot?.imageSourceId) return;
      const key = referenceKeyForShot(shot);
      if (!key || referenceKeys.has(key)) return;
      const token = `@img${referenceKeys.size + 1}`;
      referenceKeys.set(key, token);
      const label = shot.imageName || `Image ${referenceKeys.size}`;
      const visualCue = visualCueFromPrompt(shot.imagePrompt, shot.prompt || label);
      referenceLines.push(`${token} : ${label}. Visual source prompt: ${visualCue}`);
    });

    const firstMarker = partRows[0]?.marker;
    const lastMarker = partRows[partRows.length - 1]?.marker;
    const nextGlobalMarker = markers.find((marker) => lastMarker && marker.time > lastMarker.time);
    const partStart = firstMarker?.time ?? start;
    const partEnd = nextGlobalMarker?.time ?? start + duration;
    const splitHeader = parts.length > 1
      ? [
          `[VIDEO PART ${partIndex + 1} / ${parts.length}]`,
          `Generate this as a separate video using max ${maxImageGuides} image guides. Hard start at ${formatSeconds(partStart, 3)}s.`,
          partIndex < parts.length - 1
            ? `Hard cut out at ${formatSeconds(partEnd, 3)}s. Continue with VIDEO PART ${partIndex + 2}; no dissolve, no transition padding.`
            : "Final part: continue from the previous hard cut and finish the sequence cleanly."
        ]
      : [];

    const rows = partRows.map(({ marker, shot, index }) => {
      const referenceKey = referenceKeyForShot(shot);
      const imageToken = referenceKey ? referenceKeys.get(referenceKey) : "";
      const nextShot = markers[index + 1] ? shots.find((item) => item.markerId === markers[index + 1].id) : null;
      const nextReferenceKey = referenceKeyForShot(nextShot || undefined);
      const nextToken = nextReferenceKey ? referenceKeys.get(nextReferenceKey) || "" : "";
      const rawShotPrompt = shot?.prompt.trim() || "";
      const shotPrompt = rawShotPrompt.includes("describe the image change")
        ? defaultMotionPrompt(marker, index)
        : rawShotPrompt || defaultMotionPrompt(marker, index);
      const visualCue = visualCueFromPrompt(shot?.imagePrompt || "", shot?.imageName || imageToken || "the assigned image");
      const nextVisualCue = visualCueFromPrompt(nextShot?.imagePrompt || "", nextShot?.imageName || nextToken || "");
      const next = markers[index + 1];
      const cueEnd = next?.time ?? start + duration;
      const range = next
        ? `${formatSeconds(marker.time, 3)}-${formatSeconds(cueEnd, 3)}s`
        : `${formatSeconds(marker.time, 3)}s`;
      const audioCue =
        `[${eventLabels[marker.kind]} / ${bandLabels[marker.band]} | amp ${formatStrength(marker.amplitude)}, low ${formatStrength(marker.low)}, mid ${formatStrength(marker.mid)}, high ${formatStrength(marker.high)}]`;
      return [
        `${range}: ${audioCue} ${imageToken ? `Use ${imageToken}. ` : ""}${shotPrompt}`,
        `Image prompt cue: ${imageToken || "image"} should show ${visualCue}.`,
        motionCueForMarker(marker, imageToken || "", index),
        transitionCue(visualCue, nextVisualCue, nextToken)
      ].filter(Boolean).join("\n");
    });

    return [
      ...splitHeader,
      "[IMAGE REFERENCES / LEGEND]",
      ...(referenceLines.length ? referenceLines : ["@img1 : Assign a reference image from the image pool before final generation."]),
      "",
      "[TIMELINE SECOND BY SECOND / AUDIO GUIDED]",
      ...rows
    ].join("\n");
  }

  const partBlocks = (parts.length ? parts : [[]]).map(buildPart);
  const videoGuidanceBlock = videoGuidance
    ? [
        "[VIDEO GUIDANCE / AUDIO-REACTIVE SHADER]",
        "Upload the exported shader guide video as @video1 / <<<video_1>>> and use it as timing guidance only.",
        "Follow @video1's pulse timing, beat-grid accents, camera impulses, hard snaps, and bar-to-bar energy changes as closely as possible.",
        "Do not copy the abstract shader graphics, rings, bars, flashes, or metronome look. Replace those shapes with the assigned image subjects, materials, petals, tendrils, surfaces, camera moves, and lighting changes.",
        `Rhythm map: ${guideBpm} BPM, ${guideBeatsPerBar}/4 feel, one quarter-note every ${formatSeconds(guideBeatSeconds, 2)}s. Treat beats 2 and 4 as snare snap moments; beats 1 and 3 as kick/body-pulse moments; eighth-note shimmer can drive small surface motion.`
      ]
    : [];

  return [
    "[SETUP]",
    setup,
    `Target video model: ${options.targetModel || "Seedance 2.0"} (${maxImageGuides} image guides per generated video)`,
    parts.length > 1 ? `Split plan: ${parts.length} generated videos with hard cuts at guide-limit boundaries.` : "Split plan: single generated video.",
    `Audio source: ${source}`,
    `Audio segment: ${formatSeconds(start, 3)}s to ${formatSeconds(start + duration, 3)}s`,
    "",
    ...videoGuidanceBlock,
    videoGuidanceBlock.length ? "" : "",
    ...partBlocks,
    "",
    "[STYLE & QUALITY BOOSTERS]",
    qualityBoosters
  ].join("\n");
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  analysis: AudioAnalysisResult | null,
  markers: AudioMarker[],
  selectedMarkerId: string
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || 960));
  const height = Math.max(220, Math.floor(rect.height || 260));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(0, 0, 0, 0.36)";
  context.fillRect(0, 0, width, height);

  if (!analysis?.waveform.length) {
    context.fillStyle = "rgba(243, 241, 230, 0.5)";
    context.font = "12px IBM Plex Mono, monospace";
    context.fillText("Audio waveform", 14, 24);
    return;
  }

  const waveformTop = 18;
  const waveformHeight = height - 82;
  const center = waveformTop + waveformHeight / 2;
  const points = analysis.waveform;
  const xForTime = (time: number) => (time / analysis.analyzedDuration) * width;

  context.strokeStyle = "rgba(237, 237, 237, 0.12)";
  context.beginPath();
  context.moveTo(0, center);
  context.lineTo(width, center);
  context.stroke();

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const x = (index / Math.max(1, points.length - 1)) * width;
    const lineHeight = Math.max(1, point.peak * waveformHeight);
    context.fillStyle = `rgba(243, 241, 230, ${0.12 + point.rms * 0.62})`;
    context.fillRect(x, center - lineHeight / 2, Math.max(1, width / points.length), lineHeight);
  }

  const bandTop = height - 52;
  const bandHeight = 10;
  points.forEach((point, index) => {
    const x = (index / Math.max(1, points.length - 1)) * width;
    const barWidth = Math.max(1, width / points.length);
    context.fillStyle = `rgba(159, 176, 157, ${0.18 + point.low * 0.62})`;
    context.fillRect(x, bandTop, barWidth, bandHeight);
    context.fillStyle = `rgba(185, 181, 208, ${0.18 + point.mid * 0.62})`;
    context.fillRect(x, bandTop + 14, barWidth, bandHeight);
    context.fillStyle = `rgba(222, 219, 201, ${0.18 + point.high * 0.62})`;
    context.fillRect(x, bandTop + 28, barWidth, bandHeight);
  });

  markers.forEach((marker, index) => {
    const x = xForTime(marker.relativeTime);
    const selected = marker.id === selectedMarkerId;
    context.strokeStyle = selected ? "#f3f1e6" : colorForBand(marker.band);
    context.lineWidth = selected ? 2 : 1;
    context.beginPath();
    context.moveTo(x, 8);
    context.lineTo(x, height - 12);
    context.stroke();
    context.fillStyle = selected ? "#f3f1e6" : colorForBand(marker.band);
    context.font = "11px IBM Plex Mono, monospace";
    context.fillText(`${index + 1} ${formatSeconds(marker.time, 2)}s`, clamp(x + 5, 6, width - 74), 16);
  });
}
