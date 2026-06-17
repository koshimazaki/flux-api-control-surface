"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasZoomControls } from "@/components/ui/canvas-zoom-controls";
import { displaySize, fitScale, maxPan } from "@/lib/canvas-geometry";
import { useCanvasViewport } from "@/lib/use-canvas-viewport";
import { useElementSize } from "@/lib/use-element-size";
import { isPanGesture } from "@/lib/use-zoom-pan";

type MaskCanvasProps = {
  imageSrc: string;
  brushSize: number;
  mask: string;
  onMaskChange: (mask: string) => void;
};

type Point = { x: number; y: number };
type PanDrag = { id: number; startX: number; startY: number; baseX: number; baseY: number };

export function MaskCanvas({ imageSrc, brushSize, mask, onMaskChange }: MaskCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const hasStrokes = useRef(false);
  const panDrag = useRef<PanDrag | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const viewport = useElementSize(viewportRef);
  const fit = naturalSize ? fitScale(naturalSize, viewport) : 0;

  const getMaxPan = useCallback(
    (zoomLevel: number) => (naturalSize ? maxPan(naturalSize, viewport, fit, zoomLevel) : { x: 0, y: 0 }),
    [naturalSize, viewport, fit]
  );

  const view = useCanvasViewport(viewportRef, getMaxPan);
  const { zoom, pan } = view;

  const display = naturalSize ? displaySize(naturalSize, fit, zoom) : { width: 0, height: 0 };

  // Measure the source image's natural resolution (drives the canvas backing store).
  useEffect(() => {
    if (!imageSrc) {
      setNaturalSize(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  // Reset the view whenever a new source image loads.
  useEffect(() => {
    view.reset();
    view.setHandMode(false);
    // view setters are stable; depend only on the image
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !naturalSize) return;
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    hasStrokes.current = false;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (mask) {
      const restored = new Image();
      restored.onload = () => {
        // restore prior strokes (mask is white-on-black; lighten keeps only strokes visible)
        context.globalCompositeOperation = "lighten";
        context.drawImage(restored, 0, 0, canvas.width, canvas.height);
        context.globalCompositeOperation = "source-over";
        hasStrokes.current = true;
      };
      restored.src = mask;
    }
    // mask is intentionally not a dependency: repainting mid-stroke would clear live drawing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalSize]);

  useEffect(() => {
    if (mask || !hasStrokes.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
  }, [mask]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function strokeTo(event: ReactPointerEvent<HTMLCanvasElement>, point: Point) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / Math.max(1, rect.width);
    context.globalCompositeOperation = event.shiftKey ? "destination-out" : "source-over";
    context.strokeStyle = "#ffffff";
    context.fillStyle = "#ffffff";
    context.lineWidth = Math.max(2, brushSize * scale);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    if (lastPoint.current) {
      context.moveTo(lastPoint.current.x, lastPoint.current.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    } else {
      context.arc(point.x, point.y, Math.max(1, (brushSize * scale) / 2), 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
    lastPoint.current = point;
    hasStrokes.current = true;
  }

  function exportMask() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const output = document.createElement("canvas");
    output.width = canvas.width;
    output.height = canvas.height;
    const context = output.getContext("2d");
    if (!context) return;
    context.fillStyle = "#000000";
    context.fillRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0);
    onMaskChange(output.toDataURL("image/png"));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (isPanGesture(event, view.handMode, view.spaceActive)) {
      if (!view.canPan) return;
      panDrag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: pan.x, baseY: pan.y };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const point = canvasPoint(event);
    if (!point) return;
    isDrawing.current = true;
    lastPoint.current = null;
    strokeTo(event, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = panDrag.current;
    if (drag && drag.id === event.pointerId) {
      view.panTo(drag.baseX + (event.clientX - drag.startX), drag.baseY + (event.clientY - drag.startY));
      return;
    }
    if (!isDrawing.current) return;
    const point = canvasPoint(event);
    if (point) strokeTo(event, point);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (panDrag.current && panDrag.current.id === event.pointerId) {
      panDrag.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPoint.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    exportMask();
  }

  const panReady = view.handMode || view.spaceActive;
  const cursor = isPanning ? "grabbing" : panReady ? "grab" : "crosshair";

  return (
    <div className="maskPaintViewport" ref={viewportRef}>
      <div
        className="maskPaintStage"
        style={{
          width: display.width || undefined,
          height: display.height || undefined,
          transform: `translate(${pan.x}px, ${pan.y}px)`
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="Tool source" draggable={false} />
        <canvas
          ref={canvasRef}
          className="maskPaintCanvas"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
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
      <small className="maskPaintHint">paint = mask · shift-drag = unpaint · scroll = zoom · space/hand-drag = pan</small>
    </div>
  );
}
