import {
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  LayoutGrid,
  PackagePlus,
  Plus,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Search,
  Square,
  Upload
} from "lucide-react";
import { useEffect, useState, type ChangeEvent, type DragEvent } from "react";
import { AssetCard } from "@/components/asset-card";
import { AssetCollectionGallery, visibleAssetCollections } from "@/components/asset-collection-gallery";
import { PanelHeader } from "@/components/ui/panel-header";
import type {
  AssetBadge,
  AssetCollection,
  AssetCollectionFilter,
  AssetCollectionMemberKind,
  AssetRecord,
  AspectRatio,
  ReferenceRole,
  WorkspaceMode
} from "@/lib/types";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;

const collectionFilterLabels: Record<AssetCollectionFilter, string> = {
  all: "All",
  images: "Images",
  collections: "Collections"
};

const collectionFilterOptions: AssetCollectionFilter[] = ["all", "images", "collections"];

type AssetLibraryProps = {
  assets: AssetRecord[];
  filteredAssets: AssetRecord[];
  searchQuery: string;
  gridSize: number;
  aspectRatio: AspectRatio;
  metadataAssetId: string | null;
  selectedAssetIds: string[];
  assetBadges: Record<string, AssetBadge[]>;
  collections: AssetCollection[];
  collectionFilter: AssetCollectionFilter;
  openedCollection: AssetCollection | null;
  onSearchChange: (value: string) => void;
  onGridSizeChange: (value: number) => void;
  onAspectRatioChange: (value: AspectRatio) => void;
  onCollectionFilterChange: (value: AssetCollectionFilter) => void;
  onCreateCollection: (name: string, assetIds?: string[]) => void;
  onAddAssetsToCollection: (collectionId: string, assetIds: string[], kind?: AssetCollectionMemberKind) => void;
  onAddSelectedToCollection: (collectionId: string) => void;
  onAddFilesToCollection: (collectionId: string, files: File[], kind?: AssetCollectionMemberKind) => void;
  onOpenCollection: (id: string | null) => void;
  onRemoveFromCollection: (collectionId: string, assetId: string) => void;
  onExportCollection: (collectionId: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onExport: () => void;
  onClear: () => void;
  onRecover: () => void;
  onImportImages: (files: File[]) => void;
  onToggleFavorite: (id: string) => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToWorkspace: (asset: AssetRecord, mode: ImageToolMode) => void;
  onSendToVtoGarment: (asset: AssetRecord) => void;
  onSendToReference: (asset: AssetRecord, role?: ReferenceRole, targetId?: string) => void;
  onSavePromptToLibrary: (asset: AssetRecord) => void;
  onToggleSelected: (id: string) => void;
  onToggleMetadata: (id: string) => void;
  onOpen: (asset: AssetRecord) => void;
  onDownload: (asset: AssetRecord) => void;
  onDelete: (id: string) => void;
};

function groupAssetsByDate(assets: AssetRecord[]) {
  const groups = new Map<string, AssetRecord[]>();
  assets.forEach((asset) => {
    const date = new Date(asset.timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
    groups.set(date, [...(groups.get(date) || []), asset]);
  });
  return Array.from(groups.entries());
}

function imageFilesFromTransfer(event: DragEvent) {
  return Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
}

export function AssetLibrary(props: AssetLibraryProps) {
  const [newCollectionName, setNewCollectionName] = useState("");
  const [targetCollectionId, setTargetCollectionId] = useState("");
  const [collectionFilterOpen, setCollectionFilterOpen] = useState(false);
  const [collectionToolsOpen, setCollectionToolsOpen] = useState(false);
  const assetGridStyle = {
    gridTemplateColumns: `repeat(${props.gridSize}, minmax(0, 1fr))`
  };
  const showAssets = props.collectionFilter !== "collections";
  const showCollections = props.collectionFilter !== "images";
  const visibleCollectionCount = visibleAssetCollections(props.collections, props.searchQuery, showCollections).length;
  const groupedAssets = showAssets ? groupAssetsByDate(props.filteredAssets) : [];
  function onImageImport(event: ChangeEvent<HTMLInputElement>) {
    props.onImportImages(Array.from(event.target.files || []));
    event.target.value = "";
  }

  useEffect(() => {
    if (targetCollectionId && props.collections.some((collection) => collection.id === targetCollectionId)) return;
    setTargetCollectionId(props.collections[0]?.id || "");
  }, [props.collections, targetCollectionId]);

  function createCollection(assetIds: string[] = []) {
    props.onCreateCollection(newCollectionName, assetIds);
    setNewCollectionName("");
    setCollectionToolsOpen(false);
  }

  function addSelectedToTargetCollection() {
    if (!targetCollectionId) return;
    props.onAddSelectedToCollection(targetCollectionId);
    setCollectionToolsOpen(false);
  }

  return (
    <section
      className="assetsPanel"
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        const files = imageFilesFromTransfer(event);
        if (!files.length) return;
        event.preventDefault();
        props.onImportImages(files);
      }}
    >
      <PanelHeader
        title="Assets Library"
        subtitle={<>{props.filteredAssets.length} of {props.assets.length} saved assets · {props.collections.length} collection{props.collections.length === 1 ? "" : "s"}</>}
      >
        <div className="assetActions">
          <div className="collectionControlCluster">
            <div className="collectionActionMenu">
              <button
                type="button"
                className={["collectionModeButton", collectionFilterOpen ? "open" : ""].filter(Boolean).join(" ")}
                title="Asset library filter"
                aria-expanded={collectionFilterOpen}
                onClick={() => {
                  setCollectionFilterOpen((open) => !open);
                  setCollectionToolsOpen(false);
                }}
              >
                <FolderOpen size={15} />
                <span>{collectionFilterLabels[props.collectionFilter]}</span>
                <ChevronDown size={14} />
              </button>
              {collectionFilterOpen && (
                <div className="collectionMenu">
                  {collectionFilterOptions.map((filter) => (
                    <button
                      type="button"
                      key={filter}
                      className={props.collectionFilter === filter ? "active" : ""}
                      onClick={() => {
                        props.onCollectionFilterChange(filter);
                        setCollectionFilterOpen(false);
                      }}
                    >
                      <span>{collectionFilterLabels[filter]}</span>
                      {props.collectionFilter === filter && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="collectionActionMenu">
              <button
                type="button"
                className={["collectionToolsButton", collectionToolsOpen ? "open" : ""].filter(Boolean).join(" ")}
                title="Collection tools"
                aria-expanded={collectionToolsOpen}
                onClick={() => {
                  setCollectionToolsOpen((open) => !open);
                  setCollectionFilterOpen(false);
                }}
              >
                <PackagePlus size={15} />
                <span>{props.selectedAssetIds.length || props.collections.length}</span>
              </button>
              {collectionToolsOpen && (
                <div className="collectionSettingsPopover">
                  <div className="collectionSettingsCard">
                    <div className="collectionSettingsCardHeader">
                      <span>Create</span>
                    </div>
                    <label>
                      <span>Name</span>
                      <input
                        value={newCollectionName}
                        onChange={(event) => setNewCollectionName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") createCollection();
                        }}
                        placeholder="New collection"
                      />
                    </label>
                    <div className="collectionPopoverActions">
                      <button type="button" onClick={() => createCollection()}>
                        <Plus size={14} />
                        Create
                      </button>
                      <button
                        type="button"
                        onClick={() => createCollection(props.selectedAssetIds)}
                        disabled={!props.selectedAssetIds.length}
                      >
                        <FolderOpen size={14} />
                        From selection
                      </button>
                    </div>
                  </div>
                  <div className="collectionSettingsCard">
                    <label>
                      <span>Target</span>
                      <select
                        value={targetCollectionId}
                        onChange={(event) => setTargetCollectionId(event.target.value)}
                        disabled={!props.collections.length}
                      >
                        {props.collections.map((collection) => (
                          <option value={collection.id} key={collection.id}>
                            {collection.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="collectionPopoverActions">
                      <button
                        type="button"
                        onClick={addSelectedToTargetCollection}
                        disabled={!targetCollectionId || !props.selectedAssetIds.length}
                      >
                        <PackagePlus size={14} />
                        Add selected {props.selectedAssetIds.length || ""}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="searchBox">
            <Search size={15} />
            <input
              value={props.searchQuery}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder="Search"
            />
          </div>
          <button onClick={() => props.onGridSizeChange(props.gridSize >= 6 ? 2 : props.gridSize + 1)} title="Grid size">
            <LayoutGrid size={16} />
            {props.gridSize}
          </button>
          <button onClick={() => props.onAspectRatioChange("1:1")} className={props.aspectRatio === "1:1" ? "selected" : ""} title="Square">
            <Square size={16} />
          </button>
          <button onClick={() => props.onAspectRatioChange("16:9")} className={props.aspectRatio === "16:9" ? "selected" : ""} title="Landscape">
            <RectangleHorizontal size={16} />
          </button>
          <button onClick={() => props.onAspectRatioChange("9:16")} className={props.aspectRatio === "9:16" ? "selected" : ""} title="Portrait">
            <RectangleVertical size={16} />
          </button>
          <button onClick={props.onExport}>
            <Download size={16} />
            Export
          </button>
          <button onClick={props.onRecover}>
            <RotateCcw size={16} />
            Recover
          </button>
          <label className="fileButton" title="Import images; PNG prompt/settings metadata is preserved when present">
            <Upload size={16} />
            Import Images
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple onChange={onImageImport} />
          </label>
          <button onClick={props.onClear}>
            <RotateCcw size={16} />
            Clear
          </button>
        </div>
      </PanelHeader>

      <div className="assetLibraryGroups">
        <AssetCollectionGallery
          collections={props.collections}
          searchQuery={props.searchQuery}
          showCollections={showCollections}
          openedCollection={props.openedCollection}
          assets={props.assets}
          gridSize={props.gridSize}
          aspectRatio={props.aspectRatio}
          selectedAssetCount={props.selectedAssetIds.length}
          onOpenAsset={props.onOpen}
          onOpenCollection={props.onOpenCollection}
          onAddAssetsToCollection={props.onAddAssetsToCollection}
          onAddSelectedToCollection={props.onAddSelectedToCollection}
          onAddFilesToCollection={props.onAddFilesToCollection}
          onRemoveFromCollection={props.onRemoveFromCollection}
          onExportCollection={props.onExportCollection}
          onDeleteCollection={props.onDeleteCollection}
        />

        {groupedAssets.map(([date, dateAssets]) => (
          <section className="assetDateGroup" key={date}>
            <div className="assetDateHeader">
              <strong>{date}</strong>
              <span>{dateAssets.length} asset{dateAssets.length === 1 ? "" : "s"}</span>
            </div>
            <div className="assetGrid" style={assetGridStyle}>
              {dateAssets.map((asset) => (
                <AssetCard
                  asset={asset}
                  aspectRatio={props.aspectRatio}
                  badges={props.assetBadges[asset.id] || []}
                  isSelected={props.selectedAssetIds.includes(asset.id)}
                  metadataOpen={props.metadataAssetId === asset.id}
                  key={asset.id}
                  onToggleSelected={props.onToggleSelected}
                  onToggleMetadata={props.onToggleMetadata}
                  onOpen={props.onOpen}
                  onDownload={props.onDownload}
                  onDelete={props.onDelete}
                  onToggleFavorite={props.onToggleFavorite}
                  onSendToPrompt={props.onSendToPrompt}
                  onSendToWorkspace={props.onSendToWorkspace}
                  onSendToVtoGarment={props.onSendToVtoGarment}
                  onSendToReference={props.onSendToReference}
                  onSavePromptToLibrary={props.onSavePromptToLibrary}
                />
              ))}
            </div>
          </section>
        ))}
        {!groupedAssets.length && !visibleCollectionCount && (
          <div className="emptyState">Drop images here or generate outputs to build the library.</div>
        )}
      </div>
    </section>
  );
}
