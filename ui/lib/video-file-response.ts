import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

/**
 * A byte range asked for by a media element, resolved against the file size.
 * `null` means no range was requested; "unsatisfiable" means one was, but it
 * falls outside the file and must be answered with 416.
 */
export type ResolvedRange = { start: number; end: number } | null | "unsatisfiable";

export function parseRangeHeader(header: string | null, size: number): ResolvedRange {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  // `bytes=-500` asks for the last 500 bytes.
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start >= size) return "unsatisfiable";
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;
  if (!Number.isFinite(end) || end < start) return "unsatisfiable";
  return { start, end };
}

/**
 * Serves a saved clip with range support.
 *
 * Without `Accept-Ranges` and a length, a browser cannot seek and reports
 * `duration` as `Infinity` for a chunked response — which silently disabled
 * every feature that needs a clip's length, the cut timeline included.
 */
export async function videoFileResponse(options: {
  filePath: string;
  contentType: string;
  fileName: string;
  request: Request;
  download?: boolean;
}) {
  const { size } = await stat(options.filePath);
  const headers: Record<string, string> = {
    "content-type": options.contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600"
  };
  if (options.download) {
    headers["content-disposition"] = `attachment; filename="${options.fileName.replace(/"/g, "")}"`;
  }

  const range = parseRangeHeader(options.request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    return new NextResponse(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
  }

  const { start, end } = range || { start: 0, end: size - 1 };
  const stream = Readable.toWeb(createReadStream(options.filePath, { start, end })) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "content-length": String(end - start + 1),
      ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {})
    }
  });
}
