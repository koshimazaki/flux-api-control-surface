import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Film, ImageIcon } from "lucide-react";
import { isGenerationInFlight, type GalleryGeneration } from "@/lib/gallery-generations";
import type { AssetRecord, AspectRatio } from "@/lib/types";

const PixelReveal = dynamic(() => import("./pixel-reveal"), { ssr: false });
const LABELS = {
  queued: "Queued", waiting: "Waiting", paused: "Paused", submitting: "Preparing",
  running: "Generating", downloading: "Saving", complete: "Loading result", failed: "Generation failed", cancelled: "Cancelled"
};

export function GalleryGenerationCard({ generation, asset, aspectRatio, onRevealed, children }: {
  generation: GalleryGeneration; asset?: AssetRecord; aspectRatio: AspectRatio;
  onRevealed: (id: string) => void; children?: ReactNode;
}) {
  const { job } = generation;
  const root = useRef<HTMLDivElement>(null);
  const [revealMedia, setRevealMedia] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [frameHeight, setFrameHeight] = useState<number>();
  const [finished, setFinished] = useState(Boolean(generation.revealed));
  const complete = useCallback(() => { setFinished(true); onRevealed(job.id); }, [onRevealed, job.id]);
  const unavailable = job.status === "failed" || job.status === "cancelled";
  const hasResult = Boolean(asset);

  useEffect(() => {
    if (finished || unavailable) return;
    const preview = root.current?.querySelector<HTMLElement>(".assetImageButton");
    if (!preview) return;
    const media = preview.querySelector<HTMLImageElement | HTMLVideoElement>("img, video");
    let delivered = false;
    const capture = () => {
      setFrameHeight(preview.getBoundingClientRect().height);
      if (!media || delivered) return;
      const isVideo = media instanceof HTMLVideoElement;
      if (isVideo ? media.readyState < 2 : !media.complete || !media.naturalWidth) return;
      delivered = true;
      // The overlay draws this decoded source as a coloured mosaic, using the
      // current shader as alpha. The real element stays underneath throughout.
      setRevealMedia(media);
    };
    const resize = new ResizeObserver(capture);
    resize.observe(preview);
    media?.addEventListener("load", capture);
    media?.addEventListener("loadeddata", capture);
    media?.addEventListener("error", complete);
    capture();
    // Only a delivered asset can time out; waiting jobs have no fake deadline.
    const timeout = hasResult ? window.setTimeout(complete, 12000) : undefined;
    return () => {
      resize.disconnect();
      media?.removeEventListener("load", capture);
      media?.removeEventListener("loadeddata", capture);
      media?.removeEventListener("error", complete);
      window.clearTimeout(timeout);
    };
  }, [hasResult, asset?.id, finished, unavailable, complete]);

  return (
    <div className="galleryGenerationSlot" ref={root} data-job-id={job.id} data-status={asset ? "complete" : job.status}>
      {asset ? children : <article className={`assetCard generationPendingCard${unavailable ? " generationUnavailable" : ""}`} aria-busy={!unavailable && job.status !== "paused"}>
        <div className="assetImageButton" style={{ aspectRatio: aspectRatio === "free" ? "16 / 9" : aspectRatio.replace(":", "/") }}>
          <span className="generationPendingIcon">{job.kind === "video" ? <Film size={18} /> : <ImageIcon size={18} />}</span>
        </div>
        <div className="assetMeta"><strong title={job.title}>{job.title}</strong></div>
        <p className="generationStatus" role="status">{LABELS[job.status]}</p>
        {unavailable && job.error && <p className="generationError">{job.error}</p>}
      </article>}
      {!finished && !unavailable && <div className="generationOverlay" style={{ height: frameHeight }}>
        <PixelReveal id={job.id} ready={Boolean(revealMedia)} media={revealMedia} paused={!hasResult && !isGenerationInFlight(job)} onComplete={complete} />
      </div>}
    </div>
  );
}
