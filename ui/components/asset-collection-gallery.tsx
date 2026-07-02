import {
  Download,
  Expand,
  FolderOpen,
  ImagePlus,
  PackagePlus,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { DragEvent } from "react";
import { collectionCoverAssetIds, collectionMemberCounts } from "@/lib/asset-collections";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import type {
  AssetCollection,
  AssetCollectionMember,
  AssetCollectionMemberKind,
  AssetRecord,
  AspectRatio
} from "@/lib/types";

type AssetCollectionGalleryProps = {
  collections: AssetCollection[];
  searchQuery: string;
  showCollections: boolean;
  openedCollection: AssetCollection | null;
  assets: AssetRecord[];
  gridSize: number;
  aspectRatio: AspectRatio;
  selectedAssetCount: number;
  onOpenAsset: (asset: AssetRecord) => void;
  onOpenCollection: (id: string | null) => void;
  onAddAssetsToCollection: (collectionId: string, assetIds: string[], kind?: AssetCollectionMemberKind) => void;
  onAddSelectedToCollection: (collectionId: string) => void;
  onAddFilesToCollection: (collectionId: string, files: File[], kind?: AssetCollectionMemberKind) => void;
  onRemoveFromCollection: (collectionId: string, assetId: string) => void;
  onExportCollection: (collectionId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
};

function isFluxAsset(asset: AssetRecord) {
  return /bfl|flux/i.test(`${asset.provider || ""} ${asset.model || ""}`);
}

function assetOrigin(asset: AssetRecord) {
  if (isFluxAsset(asset)) {
    return { label: "F", className: "flux", title: "FLUX output", icon: Sparkles };
  }
  if (asset.assetKind === "input") {
    return { label: "Input", className: "input", title: "Imported input image", icon: Upload };
  }
  if (asset.assetKind === "reference") {
    return { label: "Ref", className: "reference", title: "Reference image", icon: ImagePlus };
  }
  if (asset.assetKind === "asset") {
    return { label: "Asset", className: "asset", title: "Local asset", icon: PackagePlus };
  }
  return { label: "Output", className: "output", title: "Generated output", icon: Download };
}

function imageFilesFromTransfer(event: DragEvent) {
  return Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
}

function imageSourceForAsset(asset: AssetRecord | undefined) {
  return asset?.imageDataUrl || asset?.sampleUrl || asset?.remoteImageUrl || asset?.imageUrl || asset?.image_url || "";
}

function assetIdsFromTransfer(event: DragEvent) {
  const payload = event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) || event.dataTransfer.getData("text/plain");
  if (!payload.startsWith("asset:")) return [];
  return [payload.slice("asset:".length)].filter(Boolean);
}

function canDropCollectionPayload(event: DragEvent) {
  const types = Array.from(event.dataTransfer.types);
  return types.includes("Files") || types.includes(BFL_IMAGE_OPTION_MIME) || types.includes("text/plain");
}

export function visibleAssetCollections(collections: AssetCollection[], searchQuery: string, showCollections: boolean) {
  if (!showCollections) return [];
  const query = searchQuery.trim().toLowerCase();
  return collections.filter((collection) =>
    query ? `${collection.name} ${collection.description || ""}`.toLowerCase().includes(query) : true
  );
}

function CollectionCard({
  collection,
  assetsById,
  isOpen,
  onOpen,
  onExport,
  onDelete,
  onDropAssetIds,
  onDropFiles
}: {
  collection: AssetCollection;
  assetsById: Map<string, AssetRecord>;
  isOpen: boolean;
  onOpen: () => void;
  onExport: () => void;
  onDelete: () => void;
  onDropAssetIds: (assetIds: string[]) => void;
  onDropFiles: (files: File[]) => void;
}) {
  const coverIds = collectionCoverAssetIds(collection);
  const counts = collectionMemberCounts(collection);
  const coverAssets = coverIds.map((id) => assetsById.get(id)).filter((asset): asset is AssetRecord => Boolean(asset));

  function handleDrop(event: DragEvent) {
    if (!canDropCollectionPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const files = imageFilesFromTransfer(event);
    if (files.length) {
      onDropFiles(files);
      return;
    }
    const assetIds = assetIdsFromTransfer(event);
    if (assetIds.length) onDropAssetIds(assetIds);
  }

  return (
    <article
      className={["collectionCard", isOpen ? "open" : ""].filter(Boolean).join(" ")}
      onDoubleClick={onOpen}
      onDragOver={(event) => {
        if (!canDropCollectionPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <button className="collectionFolderPreview" onClick={onOpen} title="Open collection">
        <span className="collectionBracket top" aria-hidden="true" />
        <span className="collectionBracket bottom" aria-hidden="true" />
        <span className="collectionCoverGrid">
          {Array.from({ length: 4 }).map((_, index) => {
            const asset = coverAssets[index];
            const src = imageSourceForAsset(asset);
            return (
              <span className="collectionCoverCell" key={`${collection.id}-cover-${index}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {src ? <img src={src} alt={asset?.title || asset?.id || collection.name} loading="lazy" /> : <FolderOpen size={18} />}
              </span>
            );
          })}
        </span>
      </button>
      <div className="collectionCardMeta">
        <strong>{collection.name}</strong>
        <span>
          {collection.members.length} item{collection.members.length === 1 ? "" : "s"} · {counts.inputs} input
          {counts.inputs === 1 ? "" : "s"} · {counts.generations} generation{counts.generations === 1 ? "" : "s"}
        </span>
      </div>
      <div className="collectionCardActions">
        <button onClick={onOpen} title="Open collection">
          <Expand size={15} />
        </button>
        <button onClick={onExport} disabled={!collection.members.length} title="Export collection ZIP">
          <Download size={15} />
        </button>
        <button onClick={onDelete} title="Delete collection">
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function CollectionAssetTile({
  asset,
  member,
  onOpen,
  onRemove
}: {
  asset: AssetRecord;
  member: AssetCollectionMember;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const origin = assetOrigin(asset);
  const OriginIcon = origin.icon;
  const source = imageSourceForAsset(asset);
  return (
    <article
      className="collectionAssetTile"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${asset.id}`);
        event.dataTransfer.setData("text/plain", `asset:${asset.id}`);
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <button className="assetImageButton" onClick={onOpen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} alt={asset.title || member.name || asset.id} loading="lazy" />
        <span className={`assetOriginBadge assetOrigin-${origin.className}`} title={origin.title}>
          <OriginIcon size={11} />
          {origin.label}
        </span>
      </button>
      <button className="collectionAssetRemove" onClick={onRemove} title="Remove from collection">
        <X size={13} />
      </button>
    </article>
  );
}

function CollectionGrid({
  members,
  assetsById,
  onOpenAsset,
  onRemove,
  onDropAssetIds,
  onDropFiles
}: {
  members: AssetCollectionMember[];
  assetsById: Map<string, AssetRecord>;
  onOpenAsset: (asset: AssetRecord) => void;
  onRemove: (assetId: string) => void;
  onDropAssetIds: (assetIds: string[]) => void;
  onDropFiles: (files: File[]) => void;
}) {
  function handleDrop(event: DragEvent) {
    if (!canDropCollectionPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const files = imageFilesFromTransfer(event);
    if (files.length) {
      onDropFiles(files);
      return;
    }
    const assetIds = assetIdsFromTransfer(event);
    if (assetIds.length) onDropAssetIds(assetIds);
  }

  return (
    <section
      className="collectionGridDropzone"
      onDragOver={(event) => {
        if (!canDropCollectionPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDrop}
    >
      <div className="collectionMemberGrid">
        {members.map((member) => {
          const asset = assetsById.get(member.assetId);
          if (!asset) {
            return (
              <div className="collectionMissingTile" key={member.assetId}>
                <FolderOpen size={16} />
                <span>{member.name || member.assetId}</span>
              </div>
            );
          }
          return (
            <CollectionAssetTile
              asset={asset}
              member={member}
              key={`${member.kind}-${member.assetId}`}
              onOpen={() => onOpenAsset(asset)}
              onRemove={() => onRemove(member.assetId)}
            />
          );
        })}
        {!members.length && <div className="collectionLaneEmpty">Drop images here</div>}
      </div>
    </section>
  );
}

export function AssetCollectionGallery(props: AssetCollectionGalleryProps) {
  const visibleCollections = visibleAssetCollections(props.collections, props.searchQuery, props.showCollections);
  const assetsById = new Map(props.assets.map((asset) => [asset.id, asset]));
  const openedInputMembers = props.openedCollection?.members.filter((member) => member.kind !== "generation") || [];
  const openedGenerationMembers = props.openedCollection?.members.filter((member) => member.kind === "generation") || [];
  const openedMembers = props.openedCollection?.members || [];
  const assetGridStyle = {
    gridTemplateColumns: `repeat(${props.gridSize}, minmax(0, 1fr))`
  };

  if (!props.showCollections) return null;

  return (
    <>
      {visibleCollections.length > 0 && (
        <section className="assetDateGroup">
          <div className="assetDateHeader">
            <strong>Collections</strong>
            <span>{visibleCollections.length} folder{visibleCollections.length === 1 ? "" : "s"}</span>
          </div>
          <div className="collectionShelf" style={assetGridStyle}>
            {visibleCollections.map((collection) => (
              <CollectionCard
                collection={collection}
                assetsById={assetsById}
                isOpen={props.openedCollection?.id === collection.id}
                key={collection.id}
                onOpen={() => props.onOpenCollection(props.openedCollection?.id === collection.id ? null : collection.id)}
                onExport={() => props.onExportCollection(collection.id)}
                onDelete={() => props.onDeleteCollection(collection.id)}
                onDropAssetIds={(assetIds) => props.onAddAssetsToCollection(collection.id, assetIds)}
                onDropFiles={(files) => props.onAddFilesToCollection(collection.id, files, "input")}
              />
            ))}
          </div>
        </section>
      )}

      {props.openedCollection && (
        <section className="collectionWindow">
          <div className="collectionWindowHeader">
            <div className="collectionWindowTitle">
              <strong>{props.openedCollection.name}</strong>
              <span>
                {props.openedCollection.members.length} item{props.openedCollection.members.length === 1 ? "" : "s"} · {openedInputMembers.length} input
                {openedInputMembers.length === 1 ? "" : "s"} · {openedGenerationMembers.length} generation{openedGenerationMembers.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="collectionWindowActions">
              <label className="fileButton" title="Import images into this collection">
                <Upload size={15} />
                Add files
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  multiple
                  onChange={(event) => {
                    props.onAddFilesToCollection(props.openedCollection!.id, Array.from(event.target.files || []), "input");
                    event.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => props.onAddSelectedToCollection(props.openedCollection!.id)}
                disabled={!props.selectedAssetCount}
              >
                <PackagePlus size={15} />
                Add selected {props.selectedAssetCount || ""}
              </button>
              <button onClick={() => props.onExportCollection(props.openedCollection!.id)} disabled={!props.openedCollection.members.length}>
                <Download size={15} />
                Export
              </button>
              <button onClick={() => props.onOpenCollection(null)} title="Close collection">
                <X size={15} />
              </button>
            </div>
          </div>
          <CollectionGrid
            members={openedMembers}
            assetsById={assetsById}
            onOpenAsset={props.onOpenAsset}
            onRemove={(assetId) => props.onRemoveFromCollection(props.openedCollection!.id, assetId)}
            onDropAssetIds={(assetIds) => props.onAddAssetsToCollection(props.openedCollection!.id, assetIds)}
            onDropFiles={(files) => props.onAddFilesToCollection(props.openedCollection!.id, files, "input")}
          />
        </section>
      )}
    </>
  );
}
