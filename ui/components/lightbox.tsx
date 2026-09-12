import { ChevronLeft, ChevronRight, Download, Eraser, Fingerprint, Focus, ImagePlus, Maximize2, PencilLine, ScanLine, Send, Shirt, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { glyphPreviewBackgroundForAsset, glyphPreviewClassName } from "@/lib/glyph-svg";
import { referenceDropTargets } from "@/lib/reference-roles";
import type { AssetRecord, ImageWorkspaceMode, ReferenceRole } from "@/lib/types";

type ImageToolMode = ImageWorkspaceMode;

type LightboxProps = {
  asset: AssetRecord | null;
  /** The list the open asset belongs to, so the viewer can step through it. */
  assets?: AssetRecord[];
  onNavigate?: (asset: AssetRecord) => void;
  onClose: () => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToWorkspace: (asset: AssetRecord, mode: ImageToolMode) => void;
  onSendToReference: (asset: AssetRecord, role?: ReferenceRole, targetId?: string) => void;
  onSendToFlux3Continue?: (asset: AssetRecord) => void;
  onSendToEdit?: (asset: AssetRecord) => void;
  onSendToUpscale?: (asset: AssetRecord) => void;
  onDownload: (asset: AssetRecord) => void;
};

export function Lightbox({ asset, assets, onNavigate, onClose, onSendToPrompt, onSendToWorkspace, onSendToReference, onSendToFlux3Continue, onSendToEdit, onSendToUpscale, onDownload }: LightboxProps) {
  const list = assets || [];
  const index = asset ? list.findIndex((item) => item.id === asset.id) : -1;
  const previous = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  // Which way the last step went, so the incoming asset slides in from that side.
  const [direction, setDirection] = useState<"next" | "previous" | null>(null);

  function step(target: AssetRecord, way: "next" | "previous") {
    setDirection(way);
    onNavigate?.(target);
  }

  // Arrow keys step through the list and Escape closes, so a set can be
  // reviewed without going back to the grid between each one.
  useEffect(() => {
    if (!asset) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && previous) step(previous, "previous");
      if (event.key === "ArrowRight" && next) step(next, "next");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!asset) return null;
  const isVideo = asset.mediaType === "video";
  const mediaSource = asset.videoUrl || asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
  const addImageTarget = referenceDropTargets.find((target) => target.id === "add-image") || referenceDropTargets[0];
  const glyphPreviewBackground = glyphPreviewBackgroundForAsset(asset);
  const innerClassName = [
    "lightboxInner",
    direction === "next" ? "steppingNext" : direction === "previous" ? "steppingPrevious" : "",
    isVideo ? "videoAssetLightbox" : "",
    glyphPreviewBackground ? "glyphAssetLightbox" : "",
    glyphPreviewClassName(glyphPreviewBackground)
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="lightbox" onClick={onClose}>
      {onNavigate && previous && (
        <button
          type="button"
          className="lightboxStep previous"
          title="Previous (left arrow)"
          aria-label="Previous asset"
          onClick={(event) => {
            event.stopPropagation();
            step(previous, "previous");
          }}
        >
          <ChevronLeft size={30} />
        </button>
      )}
      {onNavigate && next && (
        <button
          type="button"
          className="lightboxStep next"
          title="Next (right arrow)"
          aria-label="Next asset"
          onClick={(event) => {
            event.stopPropagation();
            step(next, "next");
          }}
        >
          <ChevronRight size={30} />
        </button>
      )}
      {/* Keyed on the asset so the slide replays for each step. */}
      <div key={asset.id} className={innerClassName} onClick={(event) => event.stopPropagation()}>
        {isVideo ? (
          <video src={mediaSource} controls autoPlay playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSource} alt={asset.title || asset.id} />
        )}
        <div className="lightboxMeta">
          <strong>{asset.title || asset.id}</strong>
          <span>
            {asset.model}
            {typeof asset.costCredits === "number" ? ` · ${asset.costCredits.toFixed(2)} cr` : ""}
          </span>
          <pre>{asset.prompt}</pre>
          <div className="assetButtons">
            <button onClick={() => onSendToPrompt(asset)}>
              <Send size={15} />
              Prompt
            </button>
            {isVideo && onSendToFlux3Continue && (
              <button
                onClick={() => {
                  onSendToFlux3Continue(asset);
                  onClose();
                }}
                title="Continue this video in FLUX 3"
              >
                <Video size={15} />
                Continue
              </button>
            )}
            {isVideo && onSendToEdit && (
              <button
                onClick={() => {
                  onSendToEdit(asset);
                  onClose();
                }}
                title="Send to Video Edit"
              >
                <PencilLine size={15} />
                Edit
              </button>
            )}
            {isVideo && onSendToUpscale && (
              <button
                onClick={() => {
                  onSendToUpscale(asset);
                  onClose();
                }}
                title="Send to Video Upscale"
              >
                <ScanLine size={15} />
                Upscale
              </button>
            )}
            {!isVideo && <div className="assetReferenceAction lightboxReferenceAction">
              <button
                onClick={() => onSendToReference(asset, addImageTarget.role, addImageTarget.id)}
                title="Add image reference"
              >
                <ImagePlus size={15} />
                Reference
              </button>
              <div className="assetReferenceMenu" aria-label="Use as reference">
                {referenceDropTargets.map((target) => (
                  <button
                    type="button"
                    key={target.id}
                    onClick={() => onSendToReference(asset, target.role, target.id)}
                    title={`Use as ${target.label} reference`}
                  >
                    {target.shortLabel}
                  </button>
                ))}
              </div>
            </div>}
            {!isVideo && <><button onClick={() => onSendToWorkspace(asset, "erase")}>
              <Eraser size={15} />
              Erase
            </button>
            <button onClick={() => onSendToWorkspace(asset, "vto")}>
              <Shirt size={15} />
              VTO
            </button>
            <button onClick={() => onSendToWorkspace(asset, "outpaint")}>
              <Maximize2 size={15} />
              Outpaint
            </button>
            <button onClick={() => onSendToWorkspace(asset, "deblur")}>
              <Focus size={15} />
              Deblur
            </button>
            <button onClick={() => onSendToWorkspace(asset, "glyphs")}>
              <Fingerprint size={15} />
              Glyphs
            </button></>}
            <button onClick={() => onDownload(asset)}>
              <Download size={15} />
              {isVideo ? "Video" : "Image"}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
