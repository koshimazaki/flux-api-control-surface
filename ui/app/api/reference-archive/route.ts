import { NextRequest, NextResponse } from "next/server";
import {
  fetchRemoteReferenceItems,
  remoteArchiveStatus,
  syncReferenceItemToRemote
} from "@/lib/remote-archive";
import type { TrainingCollection, TrainingCollectionItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReferenceArchiveBody = {
  collection?: Pick<TrainingCollection, "id" | "name" | "triggerToken" | "captionGuide">;
  items?: TrainingCollectionItem[];
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function collectionMeta(collection?: ReferenceArchiveBody["collection"]) {
  return {
    id: collection?.id || "reference-set",
    name: collection?.name || "Reference set",
    triggerToken: collection?.triggerToken || "bfl_cyberflower",
    captionGuide: collection?.captionGuide || ""
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReferenceIndex(items: TrainingCollectionItem[]) {
  const cards = items.map((item) => {
    const title = escapeHtml(item.name || item.fileName);
    const caption = escapeHtml(item.caption || "");
    const imageSrc = escapeHtml(item.imageDataUrl);
    return `<article><img src="${imageSrc}" alt="${title}"><strong>${title}</strong><p>${caption}</p></article>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BFL Reference Archive</title>
<style>
body{margin:0;background:#050605;color:#f3f1e6;font:14px/1.4 system-ui,sans-serif}
main{padding:18px;display:grid;gap:14px}
section{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
article{border:1px solid rgba(237,237,237,.16);background:rgba(0,0,0,.56);border-radius:8px;padding:10px;min-width:0}
img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:6px;background:#000}
strong,p{display:block;overflow:hidden;text-overflow:ellipsis}
p{color:rgba(243,241,230,.65);font-size:12px}
</style>
</head>
<body><main><h1>BFL Reference Archive</h1><section>${cards}</section></main></body>
</html>`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit")) || 500));
  const setId = url.searchParams.get("setId") || undefined;
  const archive = remoteArchiveStatus();
  const items = archive.configured ? await fetchRemoteReferenceItems(limit, setId).catch(() => []) : [];

  if (url.searchParams.get("format") === "html") {
    return new Response(renderReferenceIndex(items), {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }

  return NextResponse.json({
    ok: true,
    configured: archive.configured,
    count: items.length,
    items
  });
}

export async function POST(request: NextRequest) {
  if (!remoteArchiveStatus().configured) {
    return jsonError("Remote archive is not configured", 503);
  }

  let body: ReferenceArchiveBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be JSON");
  }

  const items = Array.isArray(body.items) ? body.items.filter((item) => item.imageDataUrl) : [];
  if (!items.length) return jsonError("Reference upload requires at least one image item");

  const collection = collectionMeta(body.collection);
  const settled = await Promise.allSettled(
    items.slice(0, 50).map((item) => syncReferenceItemToRemote({ collection, item }))
  );
  const uploaded = settled.filter((result) => result.status === "fulfilled" && result.value?.ok).length;
  const failed = settled.length - uploaded;

  return NextResponse.json({
    ok: failed === 0,
    uploaded,
    failed,
    configured: true,
    errors: settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason))
  }, { status: uploaded ? 200 : 502 });
}
