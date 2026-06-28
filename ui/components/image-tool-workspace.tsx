import { ImagePlus, Shirt, UserRound, X } from "lucide-react";
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { CanvasZoomControls } from "@/components/ui/canvas-zoom-controls";
import { CanvasSurface } from "@/components/ui/canvas-surface";
import { MaskCanvas } from "@/components/mask-canvas";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { GlyphLab, type GlyphSavePayload } from "@/components/glyph-lab";
import { displaySize, fitScale, maxPan, screenToCanvasScale } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { useCanvasViewport } from "@/lib/use-canvas-viewport";
import { useElementSize } from "@/lib/use-element-size";
import { isPanGesture } from "@/lib/use-zoom-pan";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";
import type { GlyphLabDraft, GlyphLabSettings } from "@/lib/glyph-lab-state";
import { BFL_IMAGE_OPTION_MIME, BFL_REFERENCE_MIME } from "@/lib/reference-drag";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;
const VTO_SLOT_COUNT = 4;

const toolCopy: Record<ImageToolMode, { title: string; eyebrow: string; endpoint: string }> = {
  erase: {
    title: "Erase",
    eyebrow: "Mask cleanup",
    endpoint: "flux-tools/erase-v1"
  },
  vto: {
    title: "Virtual Try-On",
    eyebrow: "Person and garment",
    endpoint: "flux-tools/vto-v1"
  },
  outpaint: {
    title: "Outpaint",
    eyebrow: "Canvas expansion",
    endpoint: "flux-tools/outpainting-v1"
  },
  deblur: {
    title: "Deblur",
    eyebrow: "Blur removal",
    endpoint: "flux-tools/deblur-v1"
  },
  glyphs: {
    title: "Glyphs",
    eyebrow: "Sticker and SVG lab",
    endpoint: "local · imagetracer"
  }
};

function EmptyToolState() {
  return (
    <div className="imageToolEmpty">
      <ImagePlus size={34} />
      <strong>No source image</strong>
      <span>Drop an image or drag an asset into this workspace.</span>
    </div>
  );
}

function DeblurPreview({ asset }: { asset: AssetRecord }) {
  return (
    <div className="deblurPreview">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetImageSource(asset)} alt={asset.title || asset.id} />
      <small className="maskPaintHint">whole-image deblur · no mask or prompt</small>
    </div>
  );
}

function imageFilesFromTransfer(event: ReactDragEvent) {
  return Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
}

function dragPayloadFromTransfer(event: ReactDragEvent) {
  return (
    event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) ||
    event.dataTransfer.getData(BFL_REFERENCE_MIME) ||
    event.dataTransfer.getData("text/plain")
  );
}

type VtoPreviewProps = {
  sourceAsset: AssetRecord | null;
  garmentAssets: (AssetRecord | null)[];
  onSourceDropPayload: (payload: string) => void;
  onSourceFiles: (files: File[]) => void;
  onGarmentDropPayload: (slotIndex: number, payload: string) => void;
  onGarmentFiles: (slotIndex: number, files: File[]) => void;
  onClearGarment: (slotIndex: number) => void;
};

function VtoPreview(props: VtoPreviewProps) {
  const garmentSlots = Array.from({ length: VTO_SLOT_COUNT }, (_, index) => props.garmentAssets[index] || null);

  function handleSourceDrop(event: ReactDragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragPayloadFromTransfer(event);
    if (payload) {
      props.onSourceDropPayload(payload);
      return;
    }
    props.onSourceFiles(imageFilesFromTransfer(event));
  }

  function handleGarmentDrop(event: ReactDragEvent, slotIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    const payload = dragPayloadFromTransfer(event);
    if (payload) {
      props.onGarmentDropPayload(slotIndex, payload);
      return;
    }
    props.onGarmentFiles(slotIndex, imageFilesFromTransfer(event).slice(0, 1));
  }

  function setAssetDrag(event: ReactDragEvent, asset: AssetRecord) {
    event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, `asset:${asset.id}`);
    event.dataTransfer.setData("text/plain", `asset:${asset.id}`);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="vtoStage">
      <div
        className={props.sourceAsset ? "vtoPersonDrop active" : "vtoPersonDrop"}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleSourceDrop}
      >
        {props.sourceAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetImageSource(props.sourceAsset)}
            alt={props.sourceAsset.title || props.sourceAsset.id}
            draggable
            onDragStart={(event) => setAssetDrag(event, props.sourceAsset!)}
          />
        ) : (
          <div className="vtoEmptyDrop">
            <UserRound size={28} />
            <strong>Person</strong>
            <span>Source image</span>
          </div>
        )}
      </div>
      <div className="vtoGarmentRail">
        {garmentSlots.map((asset, index) => (
          <div
            className={asset ? "vtoGarmentSlot active" : "vtoGarmentSlot"}
            key={`vto-garment-${index}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleGarmentDrop(event, index)}
          >
            <div className="vtoSlotHeader">
              <span>
                <Shirt size={13} />
                Garment {index + 1}
              </span>
              {asset && (
                <IconButton title="Clear garment" onClick={() => props.onClearGarment(index)}>
                  <X size={12} />
                </IconButton>
              )}
            </div>
            {asset ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetImageSource(asset)}
                alt={asset.title || asset.id}
                draggable
                onDragStart={(event) => setAssetDrag(event, asset)}
              />
            ) : (
              <div className="vtoSlotEmpty">
                <ImagePlus size={17} />
                <span>Drop image</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type OutpaintPreviewProps = {
  asset: AssetRecord;
  canvasWidth: number;
  canvasHeight: number;
  offsetX: string;
  offsetY: string;
  onOffsetXChange: (value: string) => void;
  onOffsetYChange: (value: string) => void;
};

type SourceDrag = { id: number; startX: number; startY: number; baseX: number; baseY: number };
type PanDrag = { id: number; startX: number; startY: number; baseX: number; baseY: number };

function OutpaintPreview({
  asset,
  canvasWidth,
  canvasHeight,
  offsetX,
  offsetY,
  onOffsetXChange,
  onOffsetYChange
}: OutpaintPreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sourceDrag = useRef<SourceDrag | null>(null);
  const panDrag = useRef<PanDrag | null>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const sourceWidth = asset.width || measured?.width || 0;
  const sourceHeight = asset.height || measured?.height || 0;
  const canvasW = Math.max(64, canvasWidth || 1024);
  const canvasH = Math.max(64, canvasHeight || 1024);
  const offX = offsetX.trim() === "" ? (canvasW - sourceWidth) / 2 : Number(offsetX) || 0;
  const offY = offsetY.trim() === "" ? (canvasH - sourceHeight) / 2 : Number(offsetY) || 0;
  const measuredReady = sourceWidth > 0 && sourceHeight > 0;

  const viewport = useElementSize(viewportRef);
  const fit = fitScale({ width: canvasW, height: canvasH }, viewport);

  const getMaxPan = useCallback(
    (zoomLevel: number) => maxPan({ width: canvasW, height: canvasH }, viewport, fit, zoomLevel),
    [canvasW, canvasH, viewport, fit]
  );

  const view = useCanvasViewport(viewportRef, getMaxPan);
  const { zoom, pan } = view;
  const frame = displaySize({ width: canvasW, height: canvasH }, fit, zoom);
  const screenToCanvas = screenToCanvasScale(fit, zoom);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Pan only when a pan gesture is active AND there is room to pan; otherwise fall
    // through to repositioning the source (e.g. hand mode left on at fit zoom).
    if (isPanGesture(event, view.handMode, view.spaceActive) && view.canPan) {
      panDrag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: pan.x, baseY: pan.y };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (!measuredReady) return;
    sourceDrag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: offX, baseY: offY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pin = panDrag.current;
    if (pin && pin.id === event.pointerId) {
      view.panTo(pin.baseX + (event.clientX - pin.startX), pin.baseY + (event.clientY - pin.startY));
      return;
    }
    const drag = sourceDrag.current;
    if (drag && drag.id === event.pointerId && screenToCanvas > 0) {
      const nextX = drag.baseX + (event.clientX - drag.startX) * screenToCanvas;
      const nextY = drag.baseY + (event.clientY - drag.startY) * screenToCanvas;
      onOffsetXChange(String(Math.round(nextX)));
      onOffsetYChange(String(Math.round(nextY)));
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (panDrag.current && panDrag.current.id === event.pointerId) {
      panDrag.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (sourceDrag.current && sourceDrag.current.id === event.pointerId) {
      sourceDrag.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const panReady = view.handMode || view.spaceActive;
  const cursor = isPanning ? "grabbing" : panReady ? "grab" : "move";

  return (
    <div className="outpaintViewport" ref={viewportRef}>
      <div
        className="outpaintCanvasFrame"
        style={{
          width: frame.width || undefined,
          height: frame.height || undefined,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          cursor
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetImageSource(asset)}
          alt={asset.title || asset.id}
          draggable={false}
          onLoad={(event) =>
            setMeasured({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
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
      <CanvasZoomControls
        zoom={zoom}
        onZoomIn={view.zoomIn}
        onZoomOut={view.zoomOut}
        onReset={view.reset}
        canPan={view.canPan}
        handMode={view.handMode}
        onToggleHand={view.toggleHand}
      />
      <small className="maskPaintHint">drag = position source · scroll = zoom · space/hand-drag = pan</small>
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
  glyphSettings: GlyphLabSettings;
  glyphDraft: GlyphLabDraft;
  vtoGarmentAssets: (AssetRecord | null)[];
  onMaskChange: (mask: string) => void;
  onOffsetXChange: (value: string) => void;
  onOffsetYChange: (value: string) => void;
  onGlyphSettingsChange: (patch: Partial<GlyphLabSettings>) => void;
  onGlyphDraftChange: (patch: Partial<GlyphLabDraft>) => void;
  onSaveGlyph: (payload: GlyphSavePayload) => Promise<void> | void;
  onClearSource: () => void;
  onSourceDropPayload: (payload: string) => void;
  onSourceFiles: (files: File[]) => void;
  onVtoGarmentDropPayload: (slotIndex: number, payload: string) => void;
  onVtoGarmentFiles: (slotIndex: number, files: File[]) => void;
  onClearVtoGarment: (slotIndex: number) => void;
};

export function ImageToolWorkspace(props: ImageToolWorkspaceProps) {
  const { mode, sourceAsset } = props;
  const copy = toolCopy[mode];
  const [isDropActive, setIsDropActive] = useState(false);

  function isSourceDrag(event: ReactDragEvent) {
    const types = Array.from(event.dataTransfer.types);
    return (
      types.includes(BFL_IMAGE_OPTION_MIME) ||
      types.includes(BFL_REFERENCE_MIME) ||
      types.includes("Files")
    );
  }

  function handleDragOver(event: ReactDragEvent) {
    if (!isSourceDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: ReactDragEvent) {
    const assetPayload = dragPayloadFromTransfer(event);
    const imageFiles = imageFilesFromTransfer(event);
    if (!assetPayload && !imageFiles.length) {
      setIsDropActive(false);
      return;
    }
    event.preventDefault();
    setIsDropActive(false);
    if (assetPayload) {
      props.onSourceDropPayload(assetPayload);
      return;
    }
    props.onSourceFiles(imageFiles);
  }

  function renderStage() {
    if (mode === "vto") {
      return (
        <VtoPreview
          sourceAsset={sourceAsset}
          garmentAssets={props.vtoGarmentAssets}
          onSourceDropPayload={props.onSourceDropPayload}
          onSourceFiles={props.onSourceFiles}
          onGarmentDropPayload={props.onVtoGarmentDropPayload}
          onGarmentFiles={props.onVtoGarmentFiles}
          onClearGarment={props.onClearVtoGarment}
        />
      );
    }
    if (!sourceAsset) return <EmptyToolState />;
    if (mode === "erase") {
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
          onOffsetXChange={props.onOffsetXChange}
          onOffsetYChange={props.onOffsetYChange}
        />
      );
    }
    if (mode === "deblur") {
      return <DeblurPreview key={sourceAsset.id} asset={sourceAsset} />;
    }
    return (
      <GlyphLab
        key={sourceAsset.id}
        sourceAsset={sourceAsset}
        settings={props.glyphSettings}
        draft={props.glyphDraft}
        onSettingsChange={props.onGlyphSettingsChange}
        onDraftChange={props.onGlyphDraftChange}
        onSave={props.onSaveGlyph}
      />
    );
  }

  return (
    <section
      className={`panel editor imageToolWorkspace ${mode}${isDropActive ? " dropReady" : ""}`}
      onDragEnter={(event) => {
        if (isSourceDrag(event)) setIsDropActive(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropActive(false);
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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

      <CanvasSurface className="imageToolCanvas" variant="tool">
        {renderStage()}
      </CanvasSurface>

      <div className="imageToolMeta">
        <MetaBox label="Source" value={sourceAsset ? sourceAsset.model : "None"} />
        <MetaBox label="Operation" value={copy.eyebrow} />
        <MetaBox
          label={mode === "vto" ? "Garments" : "Mask"}
          value={
            mode === "erase"
              ? props.mask
                ? "painted"
                : "empty"
              : mode === "vto"
                ? `${props.vtoGarmentAssets.filter(Boolean).length}/${VTO_SLOT_COUNT}`
              : mode === "deblur"
                ? "whole image"
                : "n/a"
          }
        />
      </div>
    </section>
  );
}
