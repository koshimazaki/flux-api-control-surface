import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AudioFormat = "mp3" | "wav";

function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

function numericField(form: FormData, key: string, fallback: number) {
  const value = Number(form.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "audio-slice";
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    const chunks: Buffer[] = [];
    child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(chunks).toString("utf8") || `ffmpeg exited with ${code}`));
    });
  });
}

function outputArgs(format: AudioFormat, outputPath: string) {
  if (format === "wav") {
    return ["-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", outputPath];
  }
  return ["-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", outputPath];
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Request must be multipart form data.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) return jsonError("Audio file is required.");

  const formatValue = String(form.get("format") || "mp3").toLowerCase();
  const format: AudioFormat = formatValue === "wav" ? "wav" : "mp3";
  const start = clamp(numericField(form, "start", 0), 0, 60 * 60);
  const end = clamp(numericField(form, "end", start + 15), start + 0.05, 60 * 60);
  const duration = clamp(end - start, 0.05, 60 * 10);
  const loopCount = clamp(Math.round(numericField(form, "loopCount", 1)), 1, 64);

  if (duration > 60 * 10) return jsonError("Audio slice is too long.");
  if (audio.size > 250 * 1024 * 1024) return jsonError("Audio file is too large.");

  const workDir = await mkdtemp(path.join(tmpdir(), "bfl-audio-slice-"));
  const inputPath = path.join(workDir, `input-${randomUUID()}`);
  const slicePath = path.join(workDir, "slice.wav");
  const outputPath = path.join(workDir, `output.${format}`);

  try {
    await writeFile(inputPath, Buffer.from(await audio.arrayBuffer()));
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ss",
      start.toFixed(3),
      "-t",
      duration.toFixed(3),
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "pcm_s16le",
      slicePath
    ]);

    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...(loopCount > 1 ? ["-stream_loop", String(loopCount - 1)] : []),
      "-i",
      slicePath,
      ...outputArgs(format, outputPath)
    ]);

    const output = await readFile(outputPath);
    const safeName = slugify(audio.name);
    const filename = `${safeName}_${start.toFixed(2)}-${end.toFixed(2)}_${loopCount}x.${format}`;
    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": format === "wav" ? "audio/wav" : "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Audio-Slice-Duration": duration.toFixed(3),
        "X-Audio-Loop-Count": String(loopCount)
      }
    });
  } catch (err) {
    return jsonError("Could not export audio slice with ffmpeg.", 500, err instanceof Error ? err.message : err);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
