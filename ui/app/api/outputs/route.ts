import { NextRequest, NextResponse } from "next/server";
import { outputPageFromUrl } from "@/lib/output-pagination";
import { fetchRemoteOutputAssets } from "@/lib/remote-archive";
import { readLocalOutputAssets } from "@/lib/server-output-store";
import type { AssetRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function uniqueById(assets: AssetRecord[]) {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const { limit, offset, includeData } = outputPageFromUrl(request.url);
  const [remoteAssets, localAssets] = await Promise.all([
    fetchRemoteOutputAssets(limit, { includeImageData: includeData }).catch(() => []),
    readLocalOutputAssets({ limit, offset, includeImageData: includeData })
  ]);

  return NextResponse.json(uniqueById([...localAssets, ...remoteAssets]).slice(0, limit));
}
