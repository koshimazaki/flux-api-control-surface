import { NextResponse } from "next/server";
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

export async function GET() {
  const [remoteAssets, localAssets] = await Promise.all([
    fetchRemoteOutputAssets().catch(() => []),
    readLocalOutputAssets()
  ]);

  return NextResponse.json(uniqueById([...remoteAssets, ...localAssets]));
}
