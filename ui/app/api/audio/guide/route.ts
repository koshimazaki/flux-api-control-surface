import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WaveformPointInput = {
  time: number;
  amplitude?: number;
  low?: number;
  mid?: number;
  high?: number;
};

type MarkerInput = {
  relativeTime?: number;
  time?: number;
  kind?: "kick" | "snare" | "hat" | "beat";
  band?: "low" | "mid" | "high";
  amplitude?: number;
};

type GuideRequest = {
  analysis?: {
    fileName?: string;
    start?: number;
    analyzedDuration?: number;
    waveform?: WaveformPointInput[];
  };
  markers?: MarkerInput[];
  width?: number;
  height?: number;
  fps?: number;
  bpm?: number;
  beatsPerBar?: number;
};

type Energy = {
  amplitude: number;
  low: number;
  mid: number;
  high: number;
};

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "audio-guide";
}

function sampleWaveform(points: WaveformPointInput[], time: number): Energy {
  if (!points.length) return { amplitude: 0, low: 0, mid: 0, high: 0 };
  let nearest = points[0];
  let distance = Math.abs(safeNumber(points[0].time, 0) - time);
  for (const point of points) {
    const nextDistance = Math.abs(safeNumber(point.time, 0) - time);
    if (nextDistance < distance) {
      nearest = point;
      distance = nextDistance;
    }
  }
  return {
    amplitude: clamp(safeNumber(nearest.amplitude, 0), 0, 1),
    low: clamp(safeNumber(nearest.low, 0), 0, 1),
    mid: clamp(safeNumber(nearest.mid, 0), 0, 1),
    high: clamp(safeNumber(nearest.high, 0), 0, 1)
  };
}

function markerTime(marker: MarkerInput, start: number) {
  if (Number.isFinite(marker.relativeTime)) return Number(marker.relativeTime);
  return Math.max(0, safeNumber(marker.time, start) - start);
}

function markerPulse(markers: MarkerInput[], time: number, start: number, filter: (marker: MarkerInput) => boolean) {
  let pulse = 0;
  for (const marker of markers) {
    if (!filter(marker)) continue;
    const distance = Math.abs(markerTime(marker, start) - time);
    if (distance > 0.32) continue;
    const amount = Math.pow(1 - distance / 0.32, 3) * clamp(safeNumber(marker.amplitude, 0.65), 0, 1);
    pulse = Math.max(pulse, amount);
  }
  return pulse;
}

function guideEnergy(points: WaveformPointInput[], markers: MarkerInput[], time: number, start: number, bpm: number, beatsPerBar: number): Energy {
  const beatLength = 60 / bpm;
  const beatPosition = (time % (beatLength * beatsPerBar)) / beatLength;
  const beatIndex = Math.floor(beatPosition) % beatsPerBar;
  const beatPhase = beatPosition - Math.floor(beatPosition);
  const quarterPulse = Math.pow(1 - Math.min(1, beatPhase * 2.8), 2.2);
  const eighthPhase = (time / (beatLength / 2)) % 1;
  const eighthPulse = Math.pow(1 - Math.min(1, Math.abs(eighthPhase) * 2), 2.4);
  const waveform = sampleWaveform(points, time);
  const kickPulse = markerPulse(markers, time, start, (marker) => marker.kind === "kick" || marker.band === "low");
  const snarePulse = markerPulse(markers, time, start, (marker) => marker.kind === "snare" || marker.band === "mid");
  const hatPulse = markerPulse(markers, time, start, (marker) => marker.kind === "hat" || marker.band === "high");
  const gridKick = beatIndex === 0 || beatIndex === 2 ? quarterPulse : 0;
  const gridSnare = beatIndex === 1 || beatIndex === 3 ? quarterPulse : 0;

  return {
    amplitude: clamp(Math.max(waveform.amplitude, kickPulse, snarePulse, hatPulse, quarterPulse * 0.55), 0, 1),
    low: clamp(Math.max(waveform.low, kickPulse, gridKick * 0.82), 0, 1),
    mid: clamp(Math.max(waveform.mid, snarePulse, gridSnare), 0, 1),
    high: clamp(Math.max(waveform.high, hatPulse, eighthPulse * 0.46), 0, 1)
  };
}

function precomputeGeometry(width: number, height: number) {
  const count = width * height;
  const dist = new Float32Array(count);
  const angle = new Float32Array(count);
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const dx = (x - centerX) / scale;
      const dy = (y - centerY) / scale;
      dist[index] = Math.sqrt(dx * dx + dy * dy);
      angle[index] = Math.atan2(dy, dx);
    }
  }
  return { dist, angle };
}

function gaussian(value: number, center: number, width: number) {
  const delta = (value - center) / width;
  return Math.exp(-delta * delta);
}

function renderFrame(
  buffer: Buffer,
  geometry: ReturnType<typeof precomputeGeometry>,
  width: number,
  height: number,
  time: number,
  energy: Energy,
  bpm: number,
  beatsPerBar: number
) {
  const beatLength = 60 / bpm;
  const beatPosition = (time % (beatLength * beatsPerBar)) / beatLength;
  const beatIndex = Math.floor(beatPosition) % beatsPerBar;
  const beatPhase = beatPosition - Math.floor(beatPosition);
  const quarterPulse = Math.pow(1 - Math.min(1, beatPhase * 2.8), 2.2);
  const snareBand = beatIndex === 1 || beatIndex === 3 ? quarterPulse : 0;
  const centerShift = (energy.mid - energy.low) * width * 0.015;
  const ringA = 0.18 + energy.low * 0.065 + energy.amplitude * 0.035;
  const ringB = 0.27 + energy.mid * 0.08;
  const ringC = 0.37 + energy.high * 0.09;

  for (let y = 0; y < height; y += 1) {
    const scan = Math.abs(y / height - 0.5);
    const snareStripe = snareBand * gaussian(scan, 0, 0.07);
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 3;
      const d = geometry.dist[pixel + Math.round(centerShift)] || geometry.dist[pixel];
      const a = geometry.angle[pixel];
      const petal = Math.max(0, Math.sin(a * 12 + time * 1.8 + d * 18)) * gaussian(d, ringB, 0.19);
      const ring =
        gaussian(d, ringA, 0.018 + energy.low * 0.016) * (0.8 + energy.low * 1.2) +
        gaussian(d, ringB, 0.022 + energy.mid * 0.018) * (0.65 + energy.mid * 1.45) +
        gaussian(d, ringC, 0.014 + energy.high * 0.012) * (0.42 + energy.high * 1.1);
      const sparkle = Math.max(0, Math.sin((x + y) * 0.055 + time * 24)) * energy.high * 0.35;
      const vignette = clamp(1 - d * 1.55, 0, 1);
      const pulse = ring + petal * energy.amplitude + sparkle + snareStripe;

      buffer[offset] = clamp(8 + vignette * 16 + pulse * (70 + energy.mid * 80), 0, 255);
      buffer[offset + 1] = clamp(11 + vignette * 18 + pulse * (92 + energy.low * 95), 0, 255);
      buffer[offset + 2] = clamp(10 + vignette * 16 + pulse * (72 + energy.high * 110 + energy.mid * 42), 0, 255);
    }
  }
}

function runFfmpegRawVideo(outputPath: string, width: number, height: number, fps: number) {
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgb24",
    "-video_size",
    `${width}x${height}`,
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath
  ];
  return spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
}

async function writeFrame(child: ReturnType<typeof runFfmpegRawVideo>, frame: Buffer) {
  if (!child.stdin.write(frame)) await once(child.stdin, "drain");
}

export async function POST(request: NextRequest) {
  let body: GuideRequest;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request must be JSON.");
  }

  const analysis = body.analysis;
  const waveform = analysis?.waveform || [];
  if (!analysis || !Array.isArray(waveform) || !waveform.length) {
    return jsonError("Audio analysis waveform is required.");
  }

  const duration = clamp(safeNumber(analysis.analyzedDuration, 0), 0.5, 30);
  const start = safeNumber(analysis.start, 0);
  const width = clamp(Math.round(safeNumber(body.width, 960)), 320, 1280);
  const height = clamp(Math.round(safeNumber(body.height, 540)), 180, 720);
  const fps = clamp(Math.round(safeNumber(body.fps, 30)), 12, 30);
  const bpm = clamp(Math.round(safeNumber(body.bpm, 60)), 30, 240);
  const beatsPerBar = clamp(Math.round(safeNumber(body.beatsPerBar, 4)), 2, 8);
  const markers = Array.isArray(body.markers) ? body.markers.slice(0, 96) : [];
  const frameCount = Math.max(1, Math.round(duration * fps));
  const workDir = await mkdtemp(path.join(tmpdir(), "bfl-audio-guide-"));
  const outputPath = path.join(workDir, "guide.mp4");
  const child = runFfmpegRawVideo(outputPath, width, height, fps);
  const stderrChunks: Buffer[] = [];
  child.stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  try {
    const geometry = precomputeGeometry(width, height);
    const frame = Buffer.alloc(width * height * 3);
    for (let index = 0; index < frameCount; index += 1) {
      const time = index / fps;
      const energy = guideEnergy(waveform, markers, time, start, bpm, beatsPerBar);
      renderFrame(frame, geometry, width, height, time, energy, bpm, beatsPerBar);
      await writeFrame(child, frame);
    }
    child.stdin.end();
    const [code] = await once(child, "close") as [number];
    if (code !== 0) {
      throw new Error(Buffer.concat(stderrChunks).toString("utf8") || `ffmpeg exited with ${code}`);
    }
    const output = await readFile(outputPath);
    const safeName = slugify(analysis.fileName || "audio-guide");
    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${safeName}_shader-guide_${duration.toFixed(2)}s.mp4"`,
        "X-Guide-Duration": duration.toFixed(3),
        "X-Guide-BPM": String(bpm),
        "X-Guide-Beats-Per-Bar": String(beatsPerBar)
      }
    });
  } catch (err) {
    child.kill("SIGKILL");
    return jsonError("Could not render audio-reactive guide video.", 500, err instanceof Error ? err.message : err);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
