import { useEffect, useState } from "react";

/** Keyed by the viewer's asset, so opening or stepping to a video gets one
 * short reveal. Buffering during playback never covers the user's controls. */
export function VideoReveal({ src, title, width, height }: {
  src?: string; title?: string; width?: number; height?: number;
}) {
  const [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState(width && height ? width / height : 16 / 9);
  useEffect(() => {
    if (ready) return;
    // A stalled or unsupported source must still expose native error/controls.
    const timer = window.setTimeout(() => setReady(true), 12000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  return <div className={`videoRevealFrame${ready ? " videoRevealReady" : ""}`} style={{ aspectRatio: ratio }} aria-busy={!ready}>
    <video src={src} controls autoPlay playsInline preload="auto" aria-label={title || "Video preview"}
      onLoadedMetadata={(event) => {
        const video = event.currentTarget;
        if (video.videoWidth && video.videoHeight) setRatio(video.videoWidth / video.videoHeight);
      }}
      onLoadedData={() => setReady(true)} onError={() => setReady(true)} />
  </div>;
}
