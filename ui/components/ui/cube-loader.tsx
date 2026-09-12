import type { CSSProperties } from "react";

/** A tiny tiled grid: rows and columns slide independently, wrapping at the rim. */
export function CubeLoader() {
  return <span className="actionCube" aria-hidden="true">
    {Array.from({ length: 9 }, (_, index) => {
      const row = Math.floor(index / 3);
      const column = index % 3;
      return <i key={index} style={{
        left: 1 + column * 6, top: 1 + row * 6,
        opacity: [0.9, 0.55, 0.75][(row + column) % 3],
        "--cube-x": `${row === 1 ? -6 : 6}px`,
        "--cube-y": `${column === 1 ? -6 : 6}px`
      } as CSSProperties} />;
    })}
  </span>;
}
