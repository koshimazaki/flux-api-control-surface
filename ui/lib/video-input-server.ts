import { readFile } from "node:fs/promises";
import { findFlux3VideoOutput } from "@/lib/flux3-video-server";
import { findVideoEditOutput } from "@/lib/video-edit-server";
import { findVideoTrimOutput } from "@/lib/video-trim-server";
import { findVideoUpscaleOutput } from "@/lib/video-upscale-server";

/**
 * One resolver for every video tool input (Video Upscale, Video Edit). A clip
 * can arrive as a data URL, raw base64, a remote HTTP(S) URL, or one of this
 * dashboard's own playback URLs — the last are read straight from disk so a
 * saved render, upscale or edit can feed the next tool without a re-download.
 */
export type ResolvedVideoInput = { buffer: Buffer; contentType: string; sourceName: string };

type LocalVideoPointer = { kind: "flux3" | "upscale" | "edit" | "trim"; id: string; source: boolean };

const LOCAL_VIDEO_ROUTE = /^\/api\/bfl\/(flux3-video|video-upscale|video-edit|video-trim)\/([^/]+)$/;

const POINTER_KIND = {
  "flux3-video": "flux3",
  "video-upscale": "upscale",
  "video-edit": "edit",
  "video-trim": "trim"
} as const;

export async function downloadVideoBinary(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not download video: ${response.status}`);
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

export function localVideoPointer(value: string, origin: string): LocalVideoPointer | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    const match = url.pathname.match(LOCAL_VIDEO_ROUTE);
    if (!match) return null;
    const kind = POINTER_KIND[match[1] as keyof typeof POINTER_KIND];
    return { kind, id: decodeURIComponent(match[2]), source: url.searchParams.get("kind") === "source" };
  } catch {
    return null;
  }
}

const POINTER_LABEL = {
  flux3: "FLUX 3 video",
  upscale: "upscale video",
  edit: "edited video",
  trim: "cut video"
} as const;

async function readLocalVideo(pointer: LocalVideoPointer): Promise<ResolvedVideoInput> {
  const side = pointer.source ? "source" : "video";
  const saved =
    pointer.kind === "flux3"
      ? await findFlux3VideoOutput(pointer.id)
      : pointer.kind === "upscale"
        ? await findVideoUpscaleOutput(pointer.id, side)
        : pointer.kind === "edit"
          ? await findVideoEditOutput(pointer.id, side)
          : await findVideoTrimOutput(pointer.id);
  if (!saved) throw new Error(`The selected ${POINTER_LABEL[pointer.kind]} is no longer available locally.`);
  return { buffer: await readFile(saved.filePath), contentType: saved.contentType, sourceName: saved.fileName };
}

export async function resolveVideoInput(value: string, origin = "http://localhost"): Promise<ResolvedVideoInput> {
  const trimmed = value.trim();
  const dataUrl = trimmed.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (dataUrl) {
    return { buffer: Buffer.from(dataUrl[2], "base64"), contentType: dataUrl[1], sourceName: "source.mp4" };
  }
  const pointer = localVideoPointer(trimmed, origin);
  if (pointer) return readLocalVideo(pointer);
  if (/^https?:\/\//i.test(trimmed)) {
    const downloaded = await downloadVideoBinary(trimmed);
    return { ...downloaded, sourceName: new URL(trimmed).pathname.split("/").pop() || "source.mp4" };
  }
  return { buffer: Buffer.from(trimmed, "base64"), contentType: "video/mp4", sourceName: "source.mp4" };
}
