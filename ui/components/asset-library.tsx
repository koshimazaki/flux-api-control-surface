import {
  Clipboard,
  Download,
  Expand,
  Heart,
  ImagePlus,
  Info,
  LayoutGrid,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Search,
  Send,
  Square,
  Trash2
} from "lucide-react";
import { copyText } from "@/lib/clipboard";
import type { AssetRecord, AspectRatio } from "@/lib/types";

type AssetLibraryProps = {
  assets: AssetRecord[];
  filteredAssets: AssetRecord[];
  searchQuery: string;
  gridSize: number;
  aspectRatio: AspectRatio;
  metadataAssetId: string | null;
  onSearchChange: (value: string) => void;
  onGridSizeChange: (value: number) => void;
  onAspectRatioChange: (value: AspectRatio) => void;
  onExport: () => void;
  onClear: () => void;
  onRecover: () => void;
  onToggleFavorite: (id: string) => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToReference: (asset: AssetRecord) => void;
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

export function AssetLibrary(props: AssetLibraryProps) {
  const assetGridStyle = {
    gridTemplateColumns: `repeat(${props.gridSize}, minmax(0, 1fr))`
  };
  const groupedAssets = groupAssetsByDate(props.filteredAssets);

  return (
    <section className="assetsPanel">
      <div className="panelHeader">
        <div>
          <h2>Output Library</h2>
          <p>{props.filteredAssets.length} of {props.assets.length} saved outputs</p>
        </div>
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
          <button onClick={props.onClear}>
            <RotateCcw size={16} />
            Clear
          </button>
        </div>
      </div>

      <div className="assetLibraryGroups">
        {groupedAssets.map(([date, dateAssets]) => (
          <section className="assetDateGroup" key={date}>
            <div className="assetDateHeader">
              <strong>{date}</strong>
              <span>{dateAssets.length} output{dateAssets.length === 1 ? "" : "s"}</span>
            </div>
            <div className="assetGrid" style={assetGridStyle}>
              {dateAssets.map((asset) => (
                <article className="assetCard" key={asset.id}>
                  <button className="assetImageButton" onClick={() => props.onOpen(asset)} style={getAspectStyle(props.aspectRatio)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.imageDataUrl} alt={asset.title || asset.id} />
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
                      inputMp: asset.inputMp,
                      outputMp: asset.outputMp,
                      runSettings: asset.runSettings,
                      request: asset.payload
                    }, null, 2)}</pre>
                  )}
                  <pre>{asset.prompt}</pre>
                  <div className="assetButtons">
                    <button onClick={() => props.onToggleFavorite(asset.id)} className={asset.is_favorite ? "hearted" : ""} title="Favorite">
                      <Heart size={15} fill={asset.is_favorite ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => props.onSendToPrompt(asset)} title="Send prompt to editor">
                      <Send size={15} />
                    </button>
                    <button onClick={() => props.onSendToReference(asset)} title="Send image to references">
                      <ImagePlus size={15} />
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
                    <button onClick={() => void copyText(asset.prompt)} title="Copy prompt">
                      <Clipboard size={15} />
                    </button>
                    <button onClick={() => props.onDelete(asset.id)} title="Delete from browser library">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {!props.filteredAssets.length && <div className="emptyState">Generated flower assets will appear here.</div>}
      </div>
    </section>
  );
}
