/**
 * Browser-side helpers shared by the video workspaces. They need FileReader
 * and a detached <video> element, so they only run inside client components.
 */
export type VideoMediaDetails = { width?: number; height?: number; duration?: number };

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

/** Reads container metadata so limits and cost can be checked before anything is paid for. */
export function inspectVideo(source: string) {
  return new Promise<VideoMediaDetails>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve({
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
      duration: Number.isFinite(video.duration) ? video.duration : undefined
    });
    video.onerror = () => resolve({});
    video.src = source;
  });
}
