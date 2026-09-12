import { describe, expect, it, vi } from "vitest";
import { applyRevealMask } from "@/components/generation/dither-field";

function canvas(pixels: number[]) {
  const frame = { data: new Uint8ClampedArray(pixels) };
  const clearRect = vi.fn();
  const context = { getImageData: () => frame, putImageData: vi.fn(), clearRect } as unknown as CanvasRenderingContext2D;
  return { context, frame, clearRect };
}

describe("shader alpha reveal", () => {
  it("starts with the exact waiting colors, including the shader's transparent background", () => {
    const { context, frame } = canvas([70, 100, 130, 255, 0, 0, 0, 0]);
    applyRevealMask(context, 2, 1, 0);
    expect([...frame.data]).toEqual([70, 100, 130, 255, 21, 23, 24, 255]);
  });
  it("reveals the live dark cells before bright ones without changing their colors", () => {
    const { context, frame } = canvas([21, 23, 24, 255, 200, 205, 210, 255]);
    applyRevealMask(context, 2, 1, 0.5);
    expect(frame.data[3]).toBe(0);
    expect(frame.data[7]).toBe(255);
    expect([...frame.data.slice(4, 7)]).toEqual([200, 205, 210]);
  });
  it("keeps diffusion stable within a job and changes its grain for another job", () => {
    const render = (seed: number) => {
      const { context, frame } = canvas(Array.from({ length: 256 }, () => [90, 93, 94, 255]).flat());
      applyRevealMask(context, 16, 16, 0.5, { seed, grain: 1 });
      return [...frame.data].filter((_, i) => i % 4 === 3);
    };
    expect(render(10)).toEqual(render(10));
    expect(render(10)).not.toEqual(render(11));
    expect(new Set(render(10)).size).toBeGreaterThan(10);
  });
  it("clears the entire mask on completion without leaving seams", () => {
    const { context, clearRect } = canvas([]);
    applyRevealMask(context, 700, 420, 1);
    expect(clearRect).toHaveBeenCalledWith(0, 0, 700, 420);
  });
});
