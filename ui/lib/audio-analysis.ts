export type AudioBandKey = "low" | "mid" | "high";

export type AudioEventKind = "kick" | "snare" | "hat" | "beat";

export type AudioMarker = {
  id: string;
  time: number;
  relativeTime: number;
  kind: AudioEventKind;
  band: AudioBandKey;
  amplitude: number;
  low: number;
  mid: number;
  high: number;
  confidence: number;
};

export type WaveformPoint = {
  time: number;
  peak: number;
  rms: number;
  amplitude: number;
  low: number;
  mid: number;
  high: number;
};

export type AudioAnalysisResult = {
  fileName: string;
  duration: number;
  sampleRate: number;
  start: number;
  analyzedDuration: number;
  waveform: WaveformPoint[];
  markers: AudioMarker[];
  bandAverages: Record<AudioBandKey | "amplitude", number>;
};

type AudioAnalysisOptions = {
  startSeconds: number;
  durationSeconds: number;
  markerCount: number;
  maxDurationSeconds?: number;
};

type AudioContextWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type FrameEnergy = {
  time: number;
  amplitude: number;
  low: number;
  mid: number;
  high: number;
  score: number;
};

const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rms(data: Float32Array, start: number, end: number) {
  let sum = 0;
  const safeEnd = Math.min(end, data.length);
  const length = Math.max(1, safeEnd - start);
  for (let index = start; index < safeEnd; index += 1) {
    sum += data[index] * data[index];
  }
  return Math.sqrt(sum / length);
}

function peak(data: Float32Array, start: number, end: number) {
  let value = 0;
  const safeEnd = Math.min(end, data.length);
  for (let index = start; index < safeEnd; index += 1) {
    value = Math.max(value, Math.abs(data[index]));
  }
  return value;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(clamp(ratio, 0, 1) * (sorted.length - 1))] || 0;
}

function normalizeValues(values: number[]) {
  const floor = percentile(values, 0.08);
  const ceiling = percentile(values, 0.98);
  const spread = Math.max(ceiling - floor, Math.max(...values, 1) * 0.08, 0.000001);
  return values.map((value) => clamp((value - floor) / spread, 0, 1));
}

async function decodeAudioFile(file: File) {
  const AudioContextCtor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("This browser does not expose the Web Audio API.");
  const context = new AudioContextCtor();
  try {
    return await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
}

function extractMonoSegment(buffer: AudioBuffer, startSeconds: number, durationSeconds: number) {
  const startFrame = Math.floor(startSeconds * buffer.sampleRate);
  const length = Math.max(1, Math.floor(durationSeconds * buffer.sampleRate));
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += (data[startFrame + index] || 0) / buffer.numberOfChannels;
    }
  }
  return mono;
}

async function renderFilteredBand(buffer: AudioBuffer, startSeconds: number, durationSeconds: number, band: AudioBandKey) {
  const sampleRate = buffer.sampleRate;
  const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;

  if (band === "low") {
    const lowpass = offline.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 180;
    lowpass.Q.value = 0.7;
    source.connect(lowpass);
    lowpass.connect(offline.destination);
  } else if (band === "mid") {
    const highpass = offline.createBiquadFilter();
    const lowpass = offline.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 180;
    highpass.Q.value = 0.7;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3600;
    lowpass.Q.value = 0.7;
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(offline.destination);
  } else {
    const highpass = offline.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 3600;
    highpass.Q.value = 0.7;
    source.connect(highpass);
    highpass.connect(offline.destination);
  }

  source.start(0, startSeconds, durationSeconds);
  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

function buildFrames(mono: Float32Array, low: Float32Array, mid: Float32Array, high: Float32Array, sampleRate: number) {
  const rawFrames = [];
  for (let offset = 0; offset < mono.length; offset += HOP_SIZE) {
    const end = Math.min(offset + FRAME_SIZE, mono.length);
    rawFrames.push({
      time: (offset + (end - offset) / 2) / sampleRate,
      amplitude: rms(mono, offset, end),
      low: rms(low, offset, end),
      mid: rms(mid, offset, end),
      high: rms(high, offset, end)
    });
    if (end >= mono.length) break;
  }

  const amplitude = normalizeValues(rawFrames.map((frame) => frame.amplitude));
  const lowBand = normalizeValues(rawFrames.map((frame) => frame.low));
  const midBand = normalizeValues(rawFrames.map((frame) => frame.mid));
  const highBand = normalizeValues(rawFrames.map((frame) => frame.high));

  return rawFrames.map((frame, index) => {
    const spectral = Math.max(lowBand[index], midBand[index], highBand[index]);
    const onset =
      Math.max(0, amplitude[index] - (amplitude[index - 1] || 0)) * 0.45 +
      Math.max(0, lowBand[index] - (lowBand[index - 1] || 0)) * 0.25 +
      Math.max(0, midBand[index] - (midBand[index - 1] || 0)) * 0.18 +
      Math.max(0, highBand[index] - (highBand[index - 1] || 0)) * 0.12;
    return {
      time: frame.time,
      amplitude: amplitude[index],
      low: lowBand[index],
      mid: midBand[index],
      high: highBand[index],
      score: clamp(amplitude[index] * 0.42 + spectral * 0.34 + onset * 0.24, 0, 1)
    };
  });
}

function nearestFrame(frames: FrameEnergy[], time: number) {
  if (!frames.length) return null;
  let nearest = frames[0];
  let bestDistance = Math.abs(frames[0].time - time);
  for (const frame of frames) {
    const distance = Math.abs(frame.time - time);
    if (distance < bestDistance) {
      nearest = frame;
      bestDistance = distance;
    }
  }
  return nearest;
}

function buildWaveform(
  mono: Float32Array,
  frames: FrameEnergy[],
  sampleRate: number,
  durationSeconds: number,
  binCount = 960
) {
  const points: WaveformPoint[] = [];
  const bins = Math.max(1, Math.min(binCount, Math.ceil(durationSeconds * 90)));
  for (let index = 0; index < bins; index += 1) {
    const start = Math.floor((index / bins) * mono.length);
    const end = Math.floor(((index + 1) / bins) * mono.length);
    const time = ((start + end) / 2) / sampleRate;
    const frame = nearestFrame(frames, time);
    points.push({
      time,
      peak: peak(mono, start, Math.max(end, start + 1)),
      rms: rms(mono, start, Math.max(end, start + 1)),
      amplitude: frame?.amplitude || 0,
      low: frame?.low || 0,
      mid: frame?.mid || 0,
      high: frame?.high || 0
    });
  }
  const peakValues = normalizeValues(points.map((point) => point.peak));
  const rmsValues = normalizeValues(points.map((point) => point.rms));
  return points.map((point, index) => ({
    ...point,
    peak: peakValues[index],
    rms: rmsValues[index]
  }));
}

function classifyFrame(frame: FrameEnergy): Pick<AudioMarker, "band" | "kind"> {
  if (frame.low >= frame.mid * 1.08 && frame.low >= frame.high * 1.14) {
    return { band: "low", kind: "kick" };
  }
  if (frame.high >= frame.low * 1.08 && frame.high >= frame.mid * 1.04) {
    return { band: "high", kind: "hat" };
  }
  if (frame.mid >= frame.low * 0.86 && frame.mid >= frame.high * 0.78) {
    return { band: "mid", kind: "snare" };
  }
  const band = frame.low > frame.mid && frame.low > frame.high ? "low" : frame.high > frame.mid ? "high" : "mid";
  return { band, kind: "beat" };
}

function markerFromFrame(frame: FrameEnergy, index: number, startSeconds: number): AudioMarker {
  const classified = classifyFrame(frame);
  return {
    id: `hit-${index + 1}-${Math.round(frame.time * 1000)}`,
    time: startSeconds + frame.time,
    relativeTime: frame.time,
    kind: classified.kind,
    band: classified.band,
    amplitude: frame.amplitude,
    low: frame.low,
    mid: frame.mid,
    high: frame.high,
    confidence: frame.score
  };
}

function farEnough(frame: FrameEnergy, chosen: FrameEnergy[], minSpacing: number) {
  return chosen.every((item) => Math.abs(item.time - frame.time) >= minSpacing);
}

function pickMarkerFrames(frames: FrameEnergy[], markerCount: number, durationSeconds: number) {
  const count = clamp(Math.round(markerCount), 1, 24);
  const minSpacing = clamp(durationSeconds / (count * 2.2), 0.28, 0.9);
  const candidates = frames
    .filter((frame, index) => {
      const previous = frames[index - 1]?.score ?? 0;
      const next = frames[index + 1]?.score ?? 0;
      return frame.score >= previous && frame.score >= next && frame.score >= 0.2;
    })
    .sort((left, right) => right.score - left.score);

  const chosen: FrameEnergy[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (farEnough(candidate, chosen, minSpacing)) chosen.push(candidate);
  }

  if (chosen.length < count) {
    for (let windowIndex = 0; windowIndex < count; windowIndex += 1) {
      const start = (windowIndex / count) * durationSeconds;
      const end = ((windowIndex + 1) / count) * durationSeconds;
      const best = frames
        .filter((frame) => frame.time >= start && frame.time < end)
        .sort((left, right) => right.score - left.score)[0];
      if (best && farEnough(best, chosen, minSpacing * 0.58)) chosen.push(best);
      if (chosen.length >= count) break;
    }
  }

  if (!chosen.length) {
    for (let index = 0; index < count; index += 1) {
      const time = (index / Math.max(1, count - 1)) * durationSeconds;
      const frame = nearestFrame(frames, time);
      if (frame) chosen.push(frame);
    }
  }

  return chosen.sort((left, right) => left.time - right.time).slice(0, count);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function analyzeAudioFile(file: File, options: AudioAnalysisOptions): Promise<AudioAnalysisResult> {
  const buffer = await decodeAudioFile(file);
  const maxDuration = options.maxDurationSeconds ?? 15;
  const safeStart = clamp(options.startSeconds || 0, 0, Math.max(0, buffer.duration - 0.05));
  const availableDuration = Math.max(0.05, buffer.duration - safeStart);
  const analyzedDuration = clamp(options.durationSeconds || maxDuration, 0.05, Math.min(maxDuration, availableDuration));
  const markerCount = clamp(options.markerCount || 6, 1, 24);
  const mono = extractMonoSegment(buffer, safeStart, analyzedDuration);
  const [low, mid, high] = await Promise.all([
    renderFilteredBand(buffer, safeStart, analyzedDuration, "low"),
    renderFilteredBand(buffer, safeStart, analyzedDuration, "mid"),
    renderFilteredBand(buffer, safeStart, analyzedDuration, "high")
  ]);
  const frames = buildFrames(mono, low, mid, high, buffer.sampleRate);
  const waveform = buildWaveform(mono, frames, buffer.sampleRate, analyzedDuration);
  const markerFrames = pickMarkerFrames(frames, markerCount, analyzedDuration);
  const markers = markerFrames.map((frame, index) => markerFromFrame(frame, index, safeStart));

  return {
    fileName: file.name,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    start: safeStart,
    analyzedDuration,
    waveform,
    markers,
    bandAverages: {
      amplitude: average(frames.map((frame) => frame.amplitude)),
      low: average(frames.map((frame) => frame.low)),
      mid: average(frames.map((frame) => frame.mid)),
      high: average(frames.map((frame) => frame.high))
    }
  };
}
