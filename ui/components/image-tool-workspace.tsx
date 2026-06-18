import { ImagePlus, X } from "lucide-react";
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
  onMaskChange: (mask: string) => void;
  onOffsetXChange: (value: string) => void;
  onOffsetYChange: (value: string) => void;
  onGlyphSettingsChange: (patch: Partial<GlyphLabSettings>) => void;
  onGlyphDraftChange: (patch: Partial<GlyphLabDraft>) => void;
  onSaveGlyph: (payload: GlyphSavePayload) => Promise<void> | void;
  onClearSource: () => void;
  onSourceDropPayload: (payload: string) => void;
  onSourceFiles: (files: File[]) => void;
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

  function imageFilesFromTransfer(event: ReactDragEvent) {
    return Array.from(event.dataTransfer.files || []).filter((file) => file.type.startsWith("image/"));
  }

  function handleDragOver(event: ReactDragEvent) {
    if (!isSourceDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: ReactDragEvent) {
    const assetPayload =
      event.dataTransfer.getData(BFL_IMAGE_OPTION_MIME) ||
      event.dataTransfer.getData(BFL_REFERENCE_MIME) ||
      event.dataTransfer.getData("text/plain");
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
          onOffsetXChange={props.onOffsetXChange}
          onOffsetYChange={props.onOffsetYChange}
        />
      );
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
          label="Mask"
          value={mode === "erase" || mode === "inpaint" ? (props.mask ? "painted" : "empty") : "n/a"}
        />
      </div>
    </section>
  );
}
