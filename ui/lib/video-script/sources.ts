import type { AssetCollection, AssetRecord } from "@/lib/types";

/**
 * Source-browser selection rules, kept out of the React component so they stay
 * testable. FLUX.3 keyframes take images only, and the matrix stores asset ids,
 * so a member that cannot be resolved to an image is not a valid input.
 */

/**
 * Enqueued rows ship `/api/outputs/<id>/image` URLs, which only resolve for
 * assets the server can actually read. A browser-only import (an asset whose
 * sole source is an in-memory data URL) would therefore turn into a guaranteed
 * failed paid job, so it is excluded from pools and slots with a reason.
 */
export function videoScriptSourceIssue(asset: AssetRecord | undefined) {
  if (!asset) return "This asset is not in the loaded library.";
  if (asset.mediaType === "video") return "Video assets cannot be used as FLUX.3 keyframes.";
  const hasAnyImage = Boolean(
    asset.imageDataUrl || asset.imageUrl || asset.sampleUrl || asset.image_url || asset.localImagePath
  );
  if (!hasAnyImage) return "This asset has no image to send.";
  const hasDurableSource = Boolean(
    asset.localImagePath ||
      asset.remoteImageKey ||
      asset.remoteImageUrl ||
      asset.assetKind === "output" ||
      isServerReadableUrl(asset.imageUrl) ||
      isServerReadableUrl(asset.sampleUrl) ||
      isServerReadableUrl(asset.image_url)
  );
  if (!hasDurableSource) {
    return "Imported in this browser only — the server cannot read it. Generate with it or export it first.";
  }
  return null;
}

function isServerReadableUrl(value: unknown) {
  if (typeof value !== "string" || !value) return false;
  if (value.startsWith("data:") || value.startsWith("blob:")) return false;
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/api/");
}

export function isVideoScriptImageAsset(asset: AssetRecord | undefined): asset is AssetRecord {
  return videoScriptSourceIssue(asset) === null;
}

/** Image members of a Collection that resolve in the loaded asset library. */
export function videoScriptPoolAssetIds(collection: AssetCollection, assets: AssetRecord[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return collection.members
    .map((member) => member.assetId)
    .filter((assetId, index, list) => list.indexOf(assetId) === index)
    .filter((assetId) => isVideoScriptImageAsset(byId.get(assetId)));
}

/** Preview source for a tile; falls back to the durable outputs route. */
export function assetPreviewSrc(asset: AssetRecord | undefined, assetId: string) {
  if (asset?.imageDataUrl) return asset.imageDataUrl;
  if (asset?.imageUrl) return asset.imageUrl;
  if (asset?.sampleUrl) return asset.sampleUrl;
  return `/api/outputs/${encodeURIComponent(assetId)}/image`;
}
