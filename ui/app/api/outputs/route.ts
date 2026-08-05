import { NextRequest, NextResponse } from "next/server";
import { outputPageFromUrl } from "@/lib/output-pagination";
import { fetchRemoteOutputAssets } from "@/lib/remote-archive";
import { readLocalOutputAssets } from "@/lib/server-output-store";
import { listFlux3VideoOutputs } from "@/lib/flux3-video-server";
import type { Flux3VideoResult } from "@/lib/flux3-video";
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

function videoAsset(result: Flux3VideoResult): AssetRecord {
  const videoPath = typeof result.outputFiles?.videoPath === "string" ? result.outputFiles.videoPath : null;
  return {
    id: result.id,
    title: result.title,
    createdAt: result.createdAt,
    timestamp: new Date(result.createdAt).getTime(),
    imageDataUrl: "",
    imageUrl: "",
    image_url: "",
    sampleUrl: result.videoUrl,
    videoUrl: result.videoUrl,
    mediaType: "video",
    model: "flux-3-video",
    prompt: result.prompt,
    status: "complete",
    aspectRatio: result.aspectRatio === "auto" ? undefined : result.aspectRatio,
    provider: "bfl-api",
    payload: {
      mode: result.mode,
      duration: result.duration,
      resolution: result.resolution,
      aspect_ratio: result.aspectRatio,
      generate_audio: result.generateAudio,
      draft: result.draft,
      draft_cache_available: result.draftCacheAvailable
    },
    references: [],
    runSettings: {
      provider: "bfl-api",
      model: "flux-3-video",
      endpointName: "flux-3-video",
      mode: result.mode,
      duration: result.duration,
      resolution: result.resolution,
      generateAudio: result.generateAudio
    },
    costCredits: result.costCredits,
    creditsAfter: result.creditsAfter,
    localVideoPath: videoPath,
    localPromptPath: typeof result.outputFiles?.promptPath === "string" ? result.outputFiles.promptPath : null,
    localMetadataPath: typeof result.outputFiles?.metadataPath === "string" ? result.outputFiles.metadataPath : null,
    operation: result.mode,
    assetKind: "output"
  };
}

export async function GET(request: NextRequest) {
  const { limit, offset, includeData } = outputPageFromUrl(request.url);
  const [remoteAssets, localAssets, videoResults] = await Promise.all([
    fetchRemoteOutputAssets(limit, { includeImageData: includeData }).catch(() => []),
    readLocalOutputAssets({ limit, offset, includeImageData: includeData }),
    listFlux3VideoOutputs(limit).catch(() => [])
  ]);

  return NextResponse.json(
    uniqueById([...videoResults.map(videoAsset), ...localAssets, ...remoteAssets])
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  );
}
