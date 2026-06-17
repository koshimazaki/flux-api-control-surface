import { useCallback, useRef, useState } from "react";
import { clampValue as clamp } from "@/lib/canvas-geometry";

export type PanBounds = { x: number; y: number };
type Point = { x: number; y: number };

type ZoomPanOptions = { min?: number; max?: number; step?: number };

/**
 * Shared zoom + pan state for the image tool canvases. `getMaxPan(zoom)` returns the
 * maximum pan offset (in viewport pixels) for a given zoom so panning never drags the
 * image fully out of view. Zooming is anchored to the centre and re-clamped on the fly.
 */
export function useZoomPan(getMaxPan: (zoom: number) => PanBounds, options: ZoomPanOptions = {}) {
  const min = options.min ?? 1;
  const max = options.max ?? 8;
  const step = options.step ?? 1.25;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const boundsRef = useRef(getMaxPan);
  boundsRef.current = getMaxPan;

  const clampPan = useCallback((x: number, y: number, atZoom?: number): Point => {
    const bounds = boundsRef.current(atZoom ?? zoomRef.current);
    return { x: clamp(x, -bounds.x, bounds.x), y: clamp(y, -bounds.y, bounds.y) };
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const prev = zoomRef.current;
      const next = clamp(prev * factor, min, max);
      if (next === prev) return;
      const ratio = next / prev;
      zoomRef.current = next;
      setPan((current) => clampPan(current.x * ratio, current.y * ratio, next));
      setZoom(next);
    },
    [min, max, clampPan]
  );

  const zoomIn = useCallback(() => zoomBy(step), [zoomBy, step]);
  const zoomOut = useCallback(() => zoomBy(1 / step), [zoomBy, step]);

  const reset = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const panTo = useCallback((x: number, y: number) => setPan(clampPan(x, y)), [clampPan]);

  // Re-clamp the current pan after the viewport or image geometry changes.
  // Returns the same reference when nothing moves so it never triggers a needless render.
  const reclamp = useCallback(
    () =>
      setPan((current) => {
        const next = clampPan(current.x, current.y);
        return next.x === current.x && next.y === current.y ? current : next;
      }),
    [clampPan]
  );

  return { zoom, pan, zoomIn, zoomOut, reset, panTo, reclamp };
}

/** Returns true when a pointer event should pan the view rather than act on the image. */
export function isPanGesture(event: { button: number; altKey: boolean }, handMode: boolean, spaceActive: boolean) {
  return handMode || spaceActive || event.button === 1 || (event.button === 0 && event.altKey);
}
