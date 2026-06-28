import {
  BookmarkPlus,
  Check,
  Clipboard,
  Download,
  Eraser,
  Expand,
  Fingerprint,
  Focus,
  Heart,
  ImagePlus,
  Info,
  LayoutGrid,
  Maximize2,
  PackagePlus,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Search,
  Send,
  Shirt,
  Sparkles,
  Square,
  Trash2,
  Upload,
  UserRound
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { PanelHeader } from "@/components/ui/panel-header";
import { AssetRoleBadge, assetRoleClassName } from "@/components/ui/asset-role-badge";
import { copyText } from "@/lib/clipboard";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";
import { referenceDropTargets } from "@/lib/reference-roles";
import type { AssetBadge, AssetRecord, AspectRatio, ReferenceRole, WorkspaceMode } from "@/lib/types";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;

type AssetLibraryProps = {
  assets: AssetRecord[];
  filteredAssets: AssetRecord[];
  searchQuery: string;
  gridSize: number;
  aspectRatio: AspectRatio;
  metadataAssetId: string | null;
  selectedAssetIds: string[];
  assetBadges: Record<string, AssetBadge[]>;
  onSearchChange: (value: string) => void;
  onGridSizeChange: (value: number) => void;
  onAspectRatioChange: (value: AspectRatio) => void;
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

function getAspectStyle(ratio: AspectRatio) {
  return ratio === "free" ? undefined : { aspectRatio: ratio.replace(":", "/") };
}

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

export function AssetLibrary(props: AssetLibraryProps) {
  const [copiedPromptAssetId, setCopiedPromptAssetId] = useState<string | null>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assetGridStyle = {
    gridTemplateColumns: `repeat(${props.gridSize}, minmax(0, 1fr))`
  };
  const groupedAssets = groupAssetsByDate(props.filteredAssets);
  const addImageTarget = referenceDropTargets.find((target) => target.id === "add-image") || referenceDropTargets[0];

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  async function copyAssetPrompt(asset: AssetRecord) {
    if (!asset.prompt.trim()) return;
    const didCopy = await copyText(asset.prompt);
    if (!didCopy) return;
    setCopiedPromptAssetId(asset.id);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => {
      setCopiedPromptAssetId((current) => (current === asset.id ? null : current));
    }, 1000);
  }

  function onImageImport(event: ChangeEvent<HTMLInputElement>) {
    props.onImportImages(Array.from(event.target.files || []));
    event.target.value = "";
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
        subtitle={<>{props.filteredAssets.length} of {props.assets.length} saved assets</>}
      >
        <div className="assetActions">
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
        {groupedAssets.map(([date, dateAssets]) => (
          <section className="assetDateGroup" key={date}>
            <div className="assetDateHeader">
              <strong>{date}</strong>
              <span>{dateAssets.length} asset{dateAssets.length === 1 ? "" : "s"}</span>
            </div>
            <div className="assetGrid" style={assetGridStyle}>
              {dateAssets.map((asset) => {
                const isSelected = props.selectedAssetIds.includes(asset.id);
                const imageSource = asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
                const badges = props.assetBadges[asset.id] || [];
                const origin = assetOrigin(asset);
                const OriginIcon = origin.icon;
                const isPromptCopied = copiedPromptAssetId === asset.id;
                const cardClass = [
                  "assetCard",
                  isSelected ? "selectedAsset" : "",
                  badges.length ? "referencedAsset" : "",
                  assetRoleClassName(badges)
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <article className={cardClass} key={asset.id}>
                    <button
                      className="assetSelectButton"
                      onClick={() => props.onToggleSelected(asset.id)}
                      title={isSelected ? "Remove from collection selection" : "Select for collection"}
                    >
                      <PackagePlus size={15} />
                    </button>
                    {badges.length > 0 && (
                      <div className="assetBadges">
                        {badges.map((badge) => (
                          <AssetRoleBadge badge={badge} key={`${badge.kind}-${badge.label}`} />
                        ))}
                      </div>
                    )}
                    <button
                      className="assetImageButton"
                      onClick={() => props.onOpen(asset)}
                      style={getAspectStyle(props.aspectRatio)}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${asset.id}`);
                        event.dataTransfer.setData("text/plain", `asset:${asset.id}`);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      title="Drag onto a workspace canvas, the prompt editor, an audio timing row, or the reference dropzone"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageSource} alt={asset.title || asset.id} />
                      <span className={`assetOriginBadge assetOrigin-${origin.className}`} title={origin.title}>
                        <OriginIcon size={11} />
                        {origin.label}
                      </span>
                    </button>
                    <div className="assetMeta">
                      <strong>{asset.title || asset.id}</strong>
                      <span>{asset.model}</span>
                    </div>
                    <p className="assetDate">
                      {new Date(asset.timestamp).toLocaleTimeString()}
                      {typeof asset.costCredits === "number" ? ` · ${asset.costCredits.toFixed(2)} cr` : ""}
                    </p>
                    {props.metadataAssetId === asset.id && (
                      <pre>{JSON.stringify({
                        seed: asset.seed,
                        width: asset.width,
                        height: asset.height,
                        costCredits: asset.costCredits,
                        creditsBefore: asset.creditsBefore,
                        creditsAfter: asset.creditsAfter,
                        creditDelta: asset.creditDelta,
                        localImagePath: asset.localImagePath,
                        localPromptPath: asset.localPromptPath,
                        localMetadataPath: asset.localMetadataPath,
                        localSvgPath: asset.localSvgPath,
                        remoteImageKey: asset.remoteImageKey,
                        remotePromptKey: asset.remotePromptKey,
                        remoteMetadataKey: asset.remoteMetadataKey,
                        r2RootPrefix: asset.r2RootPrefix,
                        inputMp: asset.inputMp,
                        outputMp: asset.outputMp,
                        runSettings: asset.runSettings,
                        request: asset.payload
                      }, null, 2)}</pre>
                    )}
                    <div className="assetPrompt">
                      <button
                        type="button"
                        className={isPromptCopied ? "assetPromptCopy copied" : "assetPromptCopy"}
                        onClick={() => void copyAssetPrompt(asset)}
                        title={isPromptCopied ? "Prompt copied" : "Copy full prompt"}
                        disabled={!asset.prompt.trim()}
                      >
                        {isPromptCopied ? <Check size={13} /> : <Clipboard size={13} />}
                      </button>
                      <pre>{asset.prompt}</pre>
                    </div>
                    <div className="assetButtons">
                      <div className="assetButtonGroup">
                        <button onClick={() => props.onSendToPrompt(asset)} title="Send prompt to Generate">
                          <Send size={15} />
                        </button>
                        <div className="assetReferenceAction">
                          <button
                            onClick={() => props.onSendToReference(asset, addImageTarget.role, addImageTarget.id)}
                            title="Add image reference"
                          >
                            <ImagePlus size={15} />
                          </button>
                          <div className="assetReferenceMenu" aria-label="Use as reference">
                            {referenceDropTargets.map((target) => (
                              <button
                                type="button"
                                key={target.id}
                                onClick={() => props.onSendToReference(asset, target.role, target.id)}
                                title={`Use as ${target.label} reference`}
                              >
                                {target.shortLabel}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="assetButtonGroup">
                        <button onClick={() => props.onSendToWorkspace(asset, "erase")} title="Send to Erase">
                          <Eraser size={15} />
                        </button>
                        <button onClick={() => props.onSendToWorkspace(asset, "vto")} title="Use as VTO person">
                          <UserRound size={15} />
                        </button>
                        <button onClick={() => props.onSendToVtoGarment(asset)} title="Add as next VTO garment">
                          <Shirt size={15} />
                        </button>
                        <button onClick={() => props.onSendToWorkspace(asset, "outpaint")} title="Send to Outpaint">
                          <Maximize2 size={15} />
                        </button>
                        <button onClick={() => props.onSendToWorkspace(asset, "deblur")} title="Send to Deblur">
                          <Focus size={15} />
                        </button>
                        <button onClick={() => props.onSendToWorkspace(asset, "glyphs")} title="Send to Glyphs">
                          <Fingerprint size={15} />
                        </button>
                      </div>
                      <div className="assetButtonGroup">
                        <button
                          onClick={() => props.onToggleSelected(asset.id)}
                          className={isSelected ? "selected" : ""}
                          title={isSelected ? "Remove from collection selection" : "Select for collection"}
                        >
                          <PackagePlus size={15} />
                        </button>
                        <button onClick={() => props.onToggleFavorite(asset.id)} className={asset.is_favorite ? "hearted" : ""} title="Favorite">
                          <Heart size={15} fill={asset.is_favorite ? "currentColor" : "none"} />
                        </button>
                        <button onClick={() => props.onSavePromptToLibrary(asset)} title="Save prompt to library">
                          <BookmarkPlus size={15} />
                        </button>
                        <button onClick={() => props.onToggleMetadata(asset.id)} title="Show metadata">
                          <Info size={15} />
                        </button>
                        <button onClick={() => props.onOpen(asset)} title="Open">
                          <Expand size={15} />
                        </button>
                        <button onClick={() => props.onDownload(asset)} title="Download">
                          <Download size={15} />
                        </button>
                        <button onClick={() => props.onDelete(asset.id)} title="Delete from browser library">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {!props.filteredAssets.length && <div className="emptyState">Drop images here or generate outputs to build the library.</div>}
      </div>
    </section>
  );
}
