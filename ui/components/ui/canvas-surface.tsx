import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from "react";

type CanvasSurfaceProps = ComponentPropsWithoutRef<"div"> & {
  variant?: "tool" | "glyph";
  checkerSize?: number;
};

export const CanvasSurface = forwardRef<HTMLDivElement, CanvasSurfaceProps>(function CanvasSurface(
  { className, checkerSize = 24, style, variant = "tool", ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={["canvasSurface", `canvasSurface-${variant}`, className].filter(Boolean).join(" ")}
      style={{ "--canvas-check-size": `${checkerSize}px`, ...style } as CSSProperties}
      {...props}
    />
  );
});
