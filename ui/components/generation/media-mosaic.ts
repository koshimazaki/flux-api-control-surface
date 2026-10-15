export type RevealMedia = HTMLImageElement | HTMLVideoElement;

/** Colour the existing shader mask with a coarse version of the real media.
 * Only the shader is read for alpha; media is drawn, so cross-origin sources
 * do not require reading their pixels. The output canvas is never read back. */
export function paintMediaMosaic(output: CanvasRenderingContext2D, sample: HTMLCanvasElement,
  shader: HTMLCanvasElement, media: RevealMedia, columns: number, rows: number, progress: number, colorOnly = false) {
  const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
  const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
  if (!sourceWidth || !sourceHeight) return false;
  const width = shader.width;
  const height = shader.height;
  if (output.canvas.width !== width) output.canvas.width = width;
  if (output.canvas.height !== height) output.canvas.height = height;
  if (sample.width !== columns) sample.width = columns;
  if (sample.height !== rows) sample.height = rows;
  const small = sample.getContext("2d");
  if (!small) return false;
  const style = getComputedStyle(media);
  const fit = style.objectFit === "contain" ? Math.min : Math.max;
  const scale = fit(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  small.clearRect(0, 0, columns, rows);
  small.fillStyle = style.backgroundColor === "rgba(0, 0, 0, 0)" ? "#151718" : style.backgroundColor;
  small.fillRect(0, 0, columns, rows);
  small.drawImage(media, (width - drawWidth) / width * columns / 2, (height - drawHeight) / height * rows / 2,
    drawWidth / width * columns, drawHeight / height * rows);
  output.clearRect(0, 0, width, height);
  output.drawImage(shader, 0, 0);
  output.save();
  output.globalCompositeOperation = "source-atop";
  const blend = colorOnly ? 1 : Math.min(1, progress / 0.3);
  output.globalAlpha = blend * blend * (3 - 2 * blend);
  output.imageSmoothingEnabled = false;
  output.drawImage(sample, 0, 0, width, height);
  output.restore();
  return true;
}
