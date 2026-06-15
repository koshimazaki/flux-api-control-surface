import { ImagePlus, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { MaskCanvas } from "@/components/mask-canvas";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { assetImageSource } from "@/lib/dashboard-tools";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;

const toolCopy: Record<ImageToolMode, { title: string; eyebrow: string; endpoint: string }> = {
  erase: {
    title: "Erase",
    eyebrow: "Mask cleanup",
    endpoint: "flux-tools/erase-v1"
  },
  inpaint: {
    title: "Inpaint",
    eyebrow: "Mask replacement",
    endpoint: "flux-pro-1.0-fill"
  },
  outpaint: {
    title: "Outpaint",
    eyebrow: "Canvas expansion",
    endpoint: "flux-tools/outpainting-v1"
  },
  glyphs: {
    title: "Glyphs",
    eyebrow: "Sticker and SVG lab",
    endpoint: "no endpoint yet"
  }
};

function EmptyToolState() {
  return (
    <div className="imageToolEmpty">
      <ImagePlus size={34} />
      <strong>No source image</strong>
      <span>Select an output and send it to this workspace.</span>
    </div>
  );
}

type OutpaintPreviewProps = {
  asset: AssetRecord;
  canvasWidth: number;
  canvasHeight: number;
  offsetX: string;
  offsetY: string;
};

function OutpaintPreview({ asset, canvasWidth, canvasHeight, offsetX, offsetY }: OutpaintPreviewProps) {
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const sourceWidth = asset.width || measured?.width || 0;
  const sourceHeight = asset.height || measured?.height || 0;
  const canvasW = Math.max(64, canvasWidth || 1024);
  const canvasH = Math.max(64, canvasHeight || 1024);
  const offX = offsetX.trim() === "" ? (canvasW - sourceWidth) / 2 : Number(offsetX) || 0;
  const offY = offsetY.trim() === "" ? (canvasH - sourceHeight) / 2 : Number(offsetY) || 0;
  const measuredReady = sourceWidth > 0 && sourceHeight > 0;

  return (
    <div className="outpaintPreview">
      <div className="outpaintCanvasFrame" style={{ aspectRatio: `${canvasW} / ${canvasH}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetImageSource(asset)}
          alt={asset.title || asset.id}
          draggable={false}
          onLoad={(event) =>
            setMeasured({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight
            })
          }
          style={
            measuredReady
              ? {
                  left: `${(offX / canvasW) * 100}%`,
                  top: `${(offY / canvasH) * 100}%`,
                  width: `${(sourceWidth / canvasW) * 100}%`,
                  height: `${(sourceHeight / canvasH) * 100}%`
                }
              : undefined
          }
        />
        <span className="outpaintCanvasLabel">
          {canvasW}×{canvasH}
        </span>
      </div>
    </div>
  );
}

type ImageToolWorkspaceProps = {
  mode: ImageToolMode;
  sourceAsset: AssetRecord | null;
  brushSize: number;
  mask: string;
  canvasWidth: number;
  canvasHeight: number;
  offsetX: string;
  offsetY: string;
  onMaskChange: (mask: string) => void;
  onClearSource: () => void;
};

export function ImageToolWorkspace(props: ImageToolWorkspaceProps) {
  const { mode, sourceAsset } = props;
  const copy = toolCopy[mode];

  function renderStage() {
    if (!sourceAsset) return <EmptyToolState />;
    if (mode === "erase" || mode === "inpaint") {
      return (
        <MaskCanvas
          key={sourceAsset.id}
          imageSrc={assetImageSource(sourceAsset)}
          brushSize={props.brushSize}
          mask={props.mask}
          onMaskChange={props.onMaskChange}
        />
      );
    }
    if (mode === "outpaint") {
      return (
        <OutpaintPreview
          key={sourceAsset.id}
          asset={sourceAsset}
          canvasWidth={props.canvasWidth}
          canvasHeight={props.canvasHeight}
          offsetX={props.offsetX}
          offsetY={props.offsetY}
        />
      );
    }
    return (
      <div className="glyphWorkbench">
        <div className="glyphSource">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetImageSource(sourceAsset)} alt={sourceAsset.title || sourceAsset.id} />
        </div>
        <div className="glyphPreviewGrid" aria-label="Glyph extraction previews">
          {["Core", "Mask", "SVG", "Motion"].map((label) => (
            <div className="glyphPreview" key={label}>
              <span />
              <small>{label}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className={`panel editor imageToolWorkspace ${mode}`}>
      <PanelHeader title={copy.title} subtitle={sourceAsset?.title || sourceAsset?.id || copy.eyebrow}>
        <div className="workspaceHeaderActions">
          <span>{copy.endpoint}</span>
          {sourceAsset && (
            <IconButton onClick={props.onClearSource} title="Clear source">
              <X size={14} />
            </IconButton>
          )}
        </div>
      </PanelHeader>

      <div className="imageToolCanvas">{renderStage()}</div>

      <div className="imageToolMeta">
        <MetaBox label="Source" value={sourceAsset ? sourceAsset.model : "None"} />
        <MetaBox label="Operation" value={copy.eyebrow} />
        <MetaBox
          label="Mask"
          value={
            mode === "erase" || mode === "inpaint" ? (props.mask ? "painted" : "empty") : "n/a"
          }
        />
      </div>
    </section>
  );
}
