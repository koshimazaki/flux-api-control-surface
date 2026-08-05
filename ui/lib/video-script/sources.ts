import type { AssetCollection, AssetRecord } from "@/lib/types";

/**
 * Source-browser selection rules, kept out of the React component so they stay
 * testable. FLUX.3 keyframes take images only, and the matrix stores asset ids,
 * so a member that cannot be resolved to an image is not a valid input.
 */

export function isVideoScriptImageAsset(asset: AssetRecord | undefined): asset is AssetRecord {
  if (!asset) return false;
  if (asset.mediaType === "video") return false;
  return Boolean(asset.imageDataUrl || asset.imageUrl || asset.sampleUrl || asset.image_url || asset.localImagePath);
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
