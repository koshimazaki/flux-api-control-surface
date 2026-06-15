"use client";

import type { PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

type MaskCanvasProps = {
  imageSrc: string;
  brushSize: number;
  mask: string;
  onMaskChange: (mask: string) => void;
};

type Point = { x: number; y: number };

export function MaskCanvas({ imageSrc, brushSize, mask, onMaskChange }: MaskCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const hasStrokes = useRef(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

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
        // restore prior strokes (mask is white-on-black; screen blend keeps only strokes visible)
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

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function strokeTo(event: PointerEvent<HTMLCanvasElement>, point: Point) {
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

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = canvasPoint(event);
    if (!point) return;
    isDrawing.current = true;
    lastPoint.current = null;
    strokeTo(event, point);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    const point = canvasPoint(event);
    if (point) strokeTo(event, point);
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPoint.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    exportMask();
  }

  return (
    <div className="maskPaintStage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc} alt="Tool source" draggable={false} />
      <canvas
        ref={canvasRef}
        className="maskPaintCanvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <small className="maskPaintHint">paint = mask · shift-drag = unpaint</small>
    </div>
  );
}
