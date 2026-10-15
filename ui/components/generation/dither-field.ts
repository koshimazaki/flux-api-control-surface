const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Rectangular light bands travel independently in X and Y, without a radial
 * vignette. A gentle crossfade of the two axes keeps the corners readable. */
export function drawGradientField(ctx: CanvasRenderingContext2D, width: number, height: number, time: number, pixelScale: number) {
  ctx.fillStyle = "#151718";
  ctx.fillRect(0, 0, width, height);
  const cell = Math.max(2, Math.min(width, height) / 26 * pixelScale);
  const xCenter = 0.5 + Math.sin(time * 0.085) * 0.65;
  const yCenter = 0.5 + Math.sin(time * 0.065 + 1.8) * 0.65;
  const axisMix = (Math.sin(time * 0.11) + 1) / 2;
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      const xBand = Math.max(0, 1 - Math.abs(x / width - xCenter) / 0.78);
      const yBand = Math.max(0, 1 - Math.abs(y / height - yCenter) / 0.78);
      const value = xBand * axisMix + yBand * (1 - axisMix);
      const grain = BAYER[(Math.floor(y / cell) % 4) * 4 + Math.floor(x / cell) % 4] / 16;
      const tone = Math.round(24 + Math.pow(value, 1.6) * 125 + grain * 8);
      ctx.fillStyle = `rgb(${tone},${tone + 3},${tone + 4})`;
      ctx.fillRect(x, y, Math.max(1, cell - 1), Math.max(1, cell - 1));
    }
  }
}

function grainValue(x: number, y: number, seed: number) {
  let value = (Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 2246822507) >>> 0;
  return (value ^ (value >>> 13)) >>> 0;
}

/** The live shader itself is the alpha mask. Dark cells clear first; sweep
 * adds transparent grain without drawing a replacement pattern. */
export function applyRevealMask(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number,
  diffusion?: { seed: number; grain: number }) {
  if (progress >= 1) { ctx.clearRect(0, 0, width, height); return; }
  const frame = ctx.getImageData(0, 0, width, height);
  const pixels = frame.data;
  for (let i = 0; i < pixels.length; i += 4) {
    // Flatten the shader's existing alpha over its waiting background so the
    // first reveal frame looks identical, then translate its light into alpha.
    const sourceAlpha = pixels[i + 3] / 255;
    const r = pixels[i] * sourceAlpha + 21 * (1 - sourceAlpha);
    const g = pixels[i + 1] * sourceAlpha + 23 * (1 - sourceAlpha);
    const b = pixels[i + 2] * sourceAlpha + 24 * (1 - sourceAlpha);
    const light = Math.max(0, Math.min(1, (r * 0.2126 + g * 0.7152 + b * 0.0722 - 22) / 160));
    let order = light;
    if (diffusion) {
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      const grain = grainValue(Math.floor(x / diffusion.grain), Math.floor(y / diffusion.grain), diffusion.seed) / 4294967295;
      const patch = grainValue(Math.floor(x / (diffusion.grain * 9)), Math.floor(y / (diffusion.grain * 9)), diffusion.seed ^ 0x9e3779b9) / 4294967295;
      const centre = Math.min(1, Math.hypot(x / width - 0.5, y / height - 0.5) * 1.4);
      // Break the existing gradient into fine transparent flecks and uneven
      // islands. The stable seed changes per job, with no directional wipe.
      order = light * 0.2 + grain * 0.5 + patch * 0.25 + centre * 0.05;
    }
    const t = Math.max(0, Math.min(1, (progress - order * 0.65) / 0.35));
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255 * (1 - t * t * (3 - 2 * t));
  }
  ctx.putImageData(frame, 0, 0);
}

/** A cleaner browsing transition: clear whole cells in place, with no grain.
 * Cell boundaries match the visible shader; its light and a per-visit seed
 * choose the order, so repeated video browsing doesn't repeat one wipe. */
export function applyBlockReveal(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number,
  grid: { cellWidth: number; cellHeight: number; seed: number }) {
  if (progress >= 1) { ctx.clearRect(0, 0, width, height); return; }
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#151718";
  ctx.fillRect(0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const columns = Math.ceil(width / grid.cellWidth);
  const rows = Math.ceil(height / grid.cellHeight);
  ctx.globalCompositeOperation = "destination-out";
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = Math.floor(col * grid.cellWidth);
      const y = Math.floor(row * grid.cellHeight);
      const right = Math.min(width, Math.floor((col + 1) * grid.cellWidth));
      const bottom = Math.min(height, Math.floor((row + 1) * grid.cellHeight));
      const sampleX = Math.min(width - 1, Math.floor((x + right) / 2));
      const sampleY = Math.min(height - 1, Math.floor((y + bottom) / 2));
      const i = (sampleY * width + sampleX) * 4;
      const light = Math.max(0, Math.min(1, (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722 - 22) / 160));
      const columnPhase = grainValue(col, 0, grid.seed) / 4294967295;
      const direction = grid.seed % 2 ? row / rows : 1 - row / rows;
      const order = light * 0.6 + columnPhase * 0.3 + direction * 0.1;
      const t = Math.max(0, Math.min(1, (progress - order * 0.75) / 0.25));
      ctx.globalAlpha = t * t * (3 - 2 * t);
      ctx.fillRect(x, y, right - x, bottom - y);
    }
  }
  ctx.restore();
}
