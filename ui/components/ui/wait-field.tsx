import { useEffect, useRef } from "react";
import { DITHER_REVEAL_MS, ditherPaletteFrom, drawDitherField } from "@/lib/effects/dither";

type WaitFieldProps = {
  /** True while the result is still coming; false starts the reveal. */
  active: boolean;
  /** Called once the field has cleared, or at once where it cannot animate. */
  onDone?: () => void;
};

/**
 * Covers a result until it has decoded, then clears over it in the order of
 * the field's own light. Ported from FLUX Studio Lite. Decorative only: the
 * parent owns the job's status text and any error.
 */
export function WaitField({ active, onDone }: WaitFieldProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The field's clock outlives the switch from waiting to arriving, so the light does not jump.
  const clock = useRef(0);
  const callback = useRef(onDone);
  callback.current = onDone;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext("2d", { alpha: true });
    if (!ctx) {
      if (!active) callback.current?.();
      return;
    }
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;
    let arrival = 0;
    let finished = false;
    let inView = true;

    const finish = () => {
      if (finished) return;
      finished = true;
      ctx.clearRect(0, 0, element.width, element.height);
      callback.current?.();
    };
    // The palette is read on each paint, so a theme change is picked up mid-wait.
    const paint = () => {
      const styles = getComputedStyle(element);
      drawDitherField(ctx, clock.current, arrival / DITHER_REVEAL_MS, ditherPaletteFrom((name) => styles.getPropertyValue(name)));
    };
    const canAnimate = () => !finished && !document.hidden && inView;
    const tick = (now: number) => {
      frame = 0;
      if (!canAnimate() || motion.matches) return;
      if (!previous) previous = now;
      const elapsed = now - previous;
      // 30 fps is plenty for a slow field and leaves the image decoder its budget.
      if (elapsed >= 1000 / 30) {
        previous = now;
        if (active) clock.current += Math.min(elapsed, 100) / 1000;
        else arrival += Math.min(elapsed, 100);
        if (!active && arrival >= DITHER_REVEAL_MS) {
          finish();
          return;
        }
        paint();
      }
      frame = requestAnimationFrame(tick);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      // With reduced motion the field stands still while waiting and lifts at once.
      if (!active && motion.matches) {
        finish();
        return;
      }
      if (!canAnimate()) return;
      paint();
      if (!motion.matches) frame = requestAnimationFrame(tick);
    };
    const resize = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      // The cell field does not need a full-resolution backing buffer.
      const scale = Math.min(devicePixelRatio || 1, 1.5, 640 / Math.max(1, box.width), 420 / Math.max(1, box.height));
      element.width = Math.max(1, Math.round(box.width * scale));
      element.height = Math.max(1, Math.round(box.height * scale));
      if (!finished) paint();
    });
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      resume();
    });
    resize.observe(element);
    visibility.observe(element);
    motion.addEventListener("change", resume);
    document.addEventListener("visibilitychange", resume);
    resume();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      motion.removeEventListener("change", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [active]);

  return <canvas ref={canvas} aria-hidden="true" className="waitField" />;
}
