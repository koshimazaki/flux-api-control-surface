import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useZoomPan, type PanBounds } from "@/lib/use-zoom-pan";

const isTypingTarget = (target: EventTarget | null) => {
  const node = target as HTMLElement | null;
  const tag = node?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node?.isContentEditable === true;
};

/**
 * Shared plumbing for the zoomable/pannable image tool stages: zoom + pan state, a
 * hand/space pan modifier, and wheel-to-zoom. The caller owns `viewportRef` (and measures
 * its size); `getMaxPan` must change identity when the geometry changes so pan re-clamps.
 */
export function useCanvasViewport(viewportRef: RefObject<HTMLElement | null>, getMaxPan: (zoom: number) => PanBounds) {
  const [handMode, setHandMode] = useState(false);
  const [spaceActive, setSpaceActive] = useState(false);
  const hoveringRef = useRef(false);
  const zoomPan = useZoomPan(getMaxPan);
  const { zoom, pan, zoomIn, zoomOut, reset, panTo, reclamp } = zoomPan;

  const canPan = useMemo(() => {
    const bounds = getMaxPan(zoom);
    return bounds.x > 0.5 || bounds.y > 0.5;
  }, [getMaxPan, zoom]);

  // Re-clamp pan when the viewport or image geometry changes (getMaxPan re-memoises on it).
  useEffect(() => {
    reclamp();
  }, [getMaxPan, reclamp]);

  // Track whether the pointer is over the canvas so the Space pan modifier only engages
  // there (and we can safely suppress the page scroll without hijacking Space elsewhere).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onEnter = () => {
      hoveringRef.current = true;
    };
    const onLeave = () => {
      hoveringRef.current = false;
    };
    element.addEventListener("pointerenter", onEnter);
    element.addEventListener("pointerleave", onLeave);
    return () => {
      element.removeEventListener("pointerenter", onEnter);
      element.removeEventListener("pointerleave", onLeave);
    };
  }, [viewportRef]);

  // Space bar is a temporary pan modifier while hovering the canvas. Suppress the default
  // page scroll only in that case; ignored while typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isTypingTarget(event.target) || !hoveringRef.current) return;
      setSpaceActive(true);
      event.preventDefault();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Wheel zoom (native non-passive listener so the page scroll can be prevented).
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.deltaY < 0) zoomIn();
      else zoomOut();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [viewportRef, zoomIn, zoomOut]);

  const toggleHand = useCallback(() => setHandMode((value) => !value), []);

  return { zoom, pan, zoomIn, zoomOut, reset, panTo, handMode, setHandMode, toggleHand, spaceActive, canPan };
}
