"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CanvasZoomControls } from "@/components/ui/canvas-zoom-controls";
import { displaySize, fitScale, maxPan, type Size } from "@/lib/canvas-geometry";
import { hardenMaskPixels } from "@/lib/flux3-image";
import { useCanvasViewport } from "@/lib/use-canvas-viewport";
import { useElementSize } from "@/lib/use-element-size";
import { isPanGesture } from "@/lib/use-zoom-pan";

export type MaskCanvasTool = "brush" | "eraser" | "lasso" | "box";

type Point = { x: number; y: number };

/** A finished gesture in image pixels, reported instead of painting when shapes are on. */
export type CanvasShape = {
  tool: MaskCanvasTool;
  /** Box: drag start and end. Brush and lasso: the traced path. */
  points: Point[];
  /** Brush diameter in image pixels. */
  brush: number;
  /** Shift was held: add to the current selection rather than start a new one. */
  additive: boolean;
};

type MaskCanvasProps = {
  imageSrc: string;
  brushSize: number;
  mask: string;
  onMaskChange: (mask: string) => void;
  /** Brush paints (the default), eraser unpaints, lasso fills a freehand outline. */
  tool?: MaskCanvasTool;
  /** Export every pixel fully in or out of the mask, with no antialiased edge. */
  hardEdges?: boolean;
  /** Shape mode: gestures are reported as shapes (e.g. regions) and the mask is left alone. */
  onShape?: (shape: CanvasShape, size: Size) => void;
  /** Drawn over the image in its own coordinate space, e.g. regions. */
  renderOverlay?: (size: Size) => ReactNode;
};

const navHint = "scroll = zoom · space/hand-drag = pan";
const maskHints: Record<MaskCanvasTool, string> = {
  brush: `paint = mask · shift-drag = unpaint · ${navHint}`,
  eraser: `drag = erase the mask · ${navHint}`,
  lasso: `drag = lasso fill · shift-drag = remove · ${navHint}`,
  box: navHint
};
const shapeHints: Record<MaskCanvasTool, string> = {
  brush: `paint = new region · shift = add to the selected one · ${navHint}`,
  eraser: navHint,
  lasso: `lasso = new region · shift = add to the selected one · ${navHint}`,
  box: `drag = new box · drag a box = move it · shift-drag = draw over boxes · delete = remove · ${navHint}`
};

function percentBox(start: Point, end: Point, size: Size) {
  return {
    left: `${(Math.min(start.x, end.x) / size.width) * 100}%`,
    top: `${(Math.min(start.y, end.y) / size.height) * 100}%`,
    width: `${(Math.abs(end.x - start.x) / size.width) * 100}%`,
    height: `${(Math.abs(end.y - start.y) / size.height) * 100}%`
  };
}
type PanDrag = { id: number; startX: number; startY: number; baseX: number; baseY: number };

export function MaskCanvas({
  imageSrc,
  brushSize,
  mask,
  onMaskChange,
  tool = "brush",
  hardEdges = false,
  onShape,
  renderOverlay
}: MaskCanvasProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const hasStrokes = useRef(false);
  const panDrag = useRef<PanDrag | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [boxDrag, setBoxDrag] = useState<{ start: Point; end: Point } | null>(null);
  // The live lasso outline, or the live brush stroke in shape mode.
  const [trace, setTrace] = useState<Point[]>([]);
  const brushPx = useRef(1);
  const shapes = Boolean(onShape);

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
    context.globalCompositeOperation = event.shiftKey || tool === "eraser" ? "destination-out" : "source-over";
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
    if (hardEdges) {
      const pixels = context.getImageData(0, 0, output.width, output.height);
      hardenMaskPixels(pixels.data);
      context.putImageData(pixels, 0, 0);
    }
    onMaskChange(output.toDataURL("image/png"));
  }

  function fillLasso(points: Point[], erase: boolean) {
    const context = canvasRef.current?.getContext("2d");
    if (!context || points.length < 3) return false;
    context.globalCompositeOperation = erase ? "destination-out" : "source-over";
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.globalCompositeOperation = "source-over";
    hasStrokes.current = true;
    return true;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    // Pan only when a pan gesture is active AND there is room to pan; otherwise fall
    // through to painting so the canvas is never dead (e.g. hand mode left on at fit zoom).
    if (isPanGesture(event, view.handMode, view.spaceActive) && view.canPan) {
      panDrag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: pan.x, baseY: pan.y };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const point = canvasPoint(event);
    if (!point) return;
    if (shapes && tool === "eraser") return;
    isDrawing.current = true;
    lastPoint.current = null;
    const rect = event.currentTarget.getBoundingClientRect();
    brushPx.current = Math.max(2, brushSize * (event.currentTarget.width / Math.max(1, rect.width)));
    if (tool === "box") setBoxDrag({ start: point, end: point });
    else if (tool === "lasso" || shapes) setTrace([point]);
    else strokeTo(event, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function extendTrace(point: Point) {
    // Thin the path: close points add size, not shape.
    const spacing = tool === "brush" ? Math.max(2, brushPx.current / 4) : 2;
    setTrace((current) => {
      const last = current[current.length - 1];
      return last && Math.hypot(point.x - last.x, point.y - last.y) < spacing ? current : [...current, point];
    });
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = panDrag.current;
    if (drag && drag.id === event.pointerId) {
      view.panTo(drag.baseX + (event.clientX - drag.startX), drag.baseY + (event.clientY - drag.startY));
      return;
    }
    if (!isDrawing.current) return;
    const point = canvasPoint(event);
    if (!point) return;
    if (tool === "box") setBoxDrag((current) => (current ? { ...current, end: point } : current));
    else if (tool === "lasso" || shapes) extendTrace(point);
    else strokeTo(event, point);
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
    if (shapes) {
      // A cancelled gesture (the browser took the pointer) draws nothing: its
      // coordinates are not an end point. A fast drag can lift before React
      // renders its last move, so a lifted box ends where the pointer did.
      const cancelled = event.type === "pointercancel";
      const points = cancelled ? [] : tool === "box" ? (boxDrag ? [boxDrag.start, canvasPoint(event) ?? boxDrag.end] : []) : trace;
      if (points.length && naturalSize) {
        onShape?.({ tool, points, brush: brushPx.current, additive: event.shiftKey }, naturalSize);
      }
      setBoxDrag(null);
      setTrace([]);
      return;
    }
    if (tool === "box") {
      setBoxDrag(null);
      return;
    }
    if (tool === "lasso") {
      const filled = fillLasso(trace, event.shiftKey);
      setTrace([]);
      if (!filled) return;
    }
    exportMask();
  }

  const panReady = view.handMode || view.spaceActive;
  const cursor = isPanning ? "grabbing" : panReady ? "grab" : "crosshair";

  return (
    // The hints sit in their own row under the canvas, so they never cover the image.
    <div className="maskPaintFrame">
      {/* Marked while a pan is ready, so overlays such as boxes let the pan through. */}
      <div className="maskPaintViewport" ref={viewportRef} data-pan-ready={panReady || isPanning ? "" : undefined}>
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
          {naturalSize && renderOverlay?.(naturalSize)}
          {naturalSize && boxDrag && (
            <span className="maskDraftBox" style={percentBox(boxDrag.start, boxDrag.end, naturalSize)} />
          )}
          {naturalSize && trace.length > 0 && (
            <svg
              className={tool === "lasso" ? "maskLassoPath" : "maskLassoPath maskBrushPath"}
              viewBox={`0 0 ${naturalSize.width} ${naturalSize.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={trace.map((point) => `${point.x},${point.y}`).join(" ")}
                style={tool === "lasso" ? undefined : { strokeWidth: brushPx.current }}
              />
            </svg>
          )}
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
      </div>
      <small className="maskPaintHint">{(shapes ? shapeHints : maskHints)[tool]}</small>
    </div>
  );
}
