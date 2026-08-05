import { Copy, FolderOpen, Images, RefreshCw, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import type { AssetCollection, AssetRecord } from "@/lib/types";
import { assetPreviewSrc, videoScriptPoolAssetIds } from "@/lib/video-script/sources";
import { VIDEO_SCRIPT_POOL_MIME, type VideoScriptSourcePool } from "@/lib/video-script/types";

/**
 * Source browser for the Video Script matrix: Asset Collections become pools of
 * valid image inputs, and both a whole pool and a single asset can be dragged
 * into the matrix.
 */
export type VideoScriptSourcesProps = {
  collections: AssetCollection[];
  assets: AssetRecord[];
  pools: VideoScriptSourcePool[];
  activePoolId: string;
  isLoading?: boolean;
  onLoadCollection: (collection: AssetCollection) => void;
  onRemovePool: (poolId: string) => void;
  onDuplicatePool: (poolId: string) => void;
  onSelectPool: (poolId: string) => void;
  onRefresh: () => void | Promise<unknown>;
};

function startPoolDrag(event: DragEvent, poolId: string) {
  event.dataTransfer.setData(VIDEO_SCRIPT_POOL_MIME, `pool:${poolId}`);
  event.dataTransfer.effectAllowed = "copy";
}

function startAssetDrag(event: DragEvent, assetId: string) {
  event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${assetId}`);
  event.dataTransfer.setData("text/plain", `asset:${assetId}`);
  event.dataTransfer.effectAllowed = "copy";
}

export function VideoScriptSources(props: VideoScriptSourcesProps) {
  const byId = new Map(props.assets.map((asset) => [asset.id, asset]));
  const activePool = props.pools.find((pool) => pool.id === props.activePoolId) || props.pools[0] || null;

  return (
    <section className="videoScriptSources">
      <div className="runLogHeader">
        <span>Sources</span>
        <button type="button" onClick={() => void props.onRefresh()} disabled={props.isLoading} title="Reload Collections">
          <RefreshCw size={13} />
          {props.isLoading ? "Loading" : "Reload"}
        </button>
      </div>

      <div className="videoScriptCollectionList">
        {props.collections.map((collection) => {
          const available = videoScriptPoolAssetIds(collection, props.assets).length;
          const loaded = props.pools.some((pool) => pool.collectionId === collection.id);
          return (
            <button
              key={collection.id}
              type="button"
              className={loaded ? "videoScriptCollection loaded" : "videoScriptCollection"}
              onClick={() => props.onLoadCollection(collection)}
              disabled={!available}
              title={available ? `Load ${available} image inputs as a pool` : "No resolvable image inputs"}
            >
              <FolderOpen size={14} />
              <strong>{collection.name}</strong>
              <small>
                {available}/{collection.members.length} images
              </small>
            </button>
          );
        })}
        {!props.collections.length && <div className="scriptEmpty">No Asset Collections yet.</div>}
      </div>

      <div className="runLogHeader videoScriptPoolHeader">
        <span>Pools</span>
        <small>drag a pool onto a column, an image onto a cell</small>
      </div>
      <div className="videoScriptPoolList">
        {props.pools.map((pool) => (
          <div
            key={pool.id}
            className={pool.id === activePool?.id ? "videoScriptPool active" : "videoScriptPool"}
            draggable
            onDragStart={(event) => startPoolDrag(event, pool.id)}
            onClick={() => props.onSelectPool(pool.id)}
          >
            <Images size={14} />
            <strong>{pool.label}</strong>
            <small>{pool.assetIds.length}</small>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onDuplicatePool(pool.id);
              }}
              title="Duplicate this pool, then vary the copy"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onRemovePool(pool.id);
              }}
              title="Remove pool"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {!props.pools.length && <div className="scriptEmpty">Load a Collection to build a pool.</div>}
      </div>

      {activePool && (
        <div className="videoScriptPoolAssets">
          {activePool.assetIds.slice(0, 60).map((assetId) => (
            <div
              key={assetId}
              className="videoScriptPoolAsset"
              draggable
              onDragStart={(event) => startAssetDrag(event, assetId)}
              title={byId.get(assetId)?.title || assetId}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetPreviewSrc(byId.get(assetId), assetId)} alt={assetId} />
            </div>
          ))}
          {activePool.assetIds.length > 60 && <small>+{activePool.assetIds.length - 60} more</small>}
        </div>
      )}
    </section>
  );
}
