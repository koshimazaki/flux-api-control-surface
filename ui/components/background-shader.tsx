"use client";

import { useEffect, useRef } from "react";

function shade(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(5 + clamped * 68);
}

export function BackgroundShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const shaderCanvas = document.createElement("canvas");
    const shaderContext = shaderCanvas.getContext("2d", { alpha: false });
    if (!shaderContext) return;

    const targetCanvas = canvas;
    const targetContext = context;
    const bufferCanvas = shaderCanvas;
    const bufferContext = shaderContext;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const cursor = {
      x: 0.58,
      y: 0.42,
      targetX: 0.58,
      targetY: 0.42
    };

    let frameId = 0;
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let imageData: ImageData | null = null;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      targetCanvas.width = Math.floor(width * ratio);
      targetCanvas.height = Math.floor(height * ratio);
      targetCanvas.style.width = `${width}px`;
      targetCanvas.style.height = `${height}px`;
      targetContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = Math.max(100, Math.floor(width / 9));
      rows = Math.max(58, Math.floor(height / 9));
      bufferCanvas.width = columns;
      bufferCanvas.height = rows;
      imageData = bufferContext.createImageData(columns, rows);
    }

    function moveCursor(event: PointerEvent) {
      if (!width || !height) return;
      cursor.targetX = event.clientX / width;
      cursor.targetY = event.clientY / height;
    }

    function render(time: number) {
      if (!imageData) return;

      cursor.x += (cursor.targetX - cursor.x) * 0.085;
      cursor.y += (cursor.targetY - cursor.y) * 0.085;

      const t = motionQuery.matches ? 0 : time * 0.00018;
      const cursorX = cursor.x - 0.5;
      const cursorY = cursor.y - 0.5;
      const data = imageData.data;
      let offset = 0;

      for (let y = 0; y < rows; y += 1) {
        const ny = y / rows - 0.5;
        for (let x = 0; x < columns; x += 1) {
          const nx = x / columns - 0.5;
          const cursorDx = nx - cursorX;
          const cursorDy = ny - cursorY;
          const cursorRadius = Math.sqrt(cursorDx * cursorDx + cursorDy * cursorDy);
          const cursorField = Math.max(0, 1 - cursorRadius * 2.35);
          const cursorPull = cursorField * cursorField;
          const warpedX = nx - cursorDx * cursorPull * 0.2 + Math.sin(cursorDy * 13 + t * 2.2) * cursorPull * 0.055;
          const warpedY = ny - cursorDy * cursorPull * 0.2 + Math.cos(cursorDx * 11 - t * 1.8) * cursorPull * 0.05;
          const radius = Math.sqrt(warpedX * warpedX + warpedY * warpedY);
          const angle = Math.atan2(warpedY, warpedX);
          const swirl = Math.sin(angle * 4.0 + radius * 18.0 - t * 7.0 + cursorX * 2.2);
          const ribbon = Math.sin(((warpedX + cursorX * 0.18) * 2.3 - (warpedY + cursorY * 0.16) * 1.6 + t * 2.4) * Math.PI);
          const pulse = Math.cos((radius * 9.0 - t * 5.0 + cursorY * 1.4) * Math.PI);
          const vignette = Math.max(0, 1 - radius * 1.45);
          const cursorLight = cursorPull * 0.5;
          const value = (swirl * 0.32 + ribbon * 0.26 + pulse * 0.2 + vignette * 0.66 + cursorLight) * 0.5 + 0.27;
          const tone = shade(value);

          data[offset] = tone;
          data[offset + 1] = tone;
          data[offset + 2] = Math.round(tone * 0.96);
          data[offset + 3] = 255;
          offset += 4;
        }
      }

      targetContext.imageSmoothingEnabled = true;
      bufferContext.putImageData(imageData, 0, 0);
      targetContext.drawImage(bufferCanvas, 0, 0, width, height);
      frameId = window.requestAnimationFrame(render);
    }

    resize();
    frameId = window.requestAnimationFrame(render);
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", moveCursor, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", moveCursor);
    };
  }, []);

  return (
    <div className="backgroundShader" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="backgroundShaderWash" />
    </div>
  );
}
