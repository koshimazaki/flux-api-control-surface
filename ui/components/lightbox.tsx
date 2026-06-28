import { Download, Eraser, Fingerprint, Focus, ImagePlus, Maximize2, Send, Shirt } from "lucide-react";
import { glyphPreviewBackgroundForAsset, glyphPreviewClassName } from "@/lib/glyph-svg";
import { referenceDropTargets } from "@/lib/reference-roles";
import type { AssetRecord, ReferenceRole, WorkspaceMode } from "@/lib/types";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;

type LightboxProps = {
  asset: AssetRecord | null;
  onClose: () => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToWorkspace: (asset: AssetRecord, mode: ImageToolMode) => void;
  onSendToReference: (asset: AssetRecord, role?: ReferenceRole, targetId?: string) => void;
  onDownload: (asset: AssetRecord) => void;
};

export function Lightbox({ asset, onClose, onSendToPrompt, onSendToWorkspace, onSendToReference, onDownload }: LightboxProps) {
  if (!asset) return null;
  const imageSource = asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;
  const addImageTarget = referenceDropTargets.find((target) => target.id === "add-image") || referenceDropTargets[0];
  const glyphPreviewBackground = glyphPreviewBackgroundForAsset(asset);
  const innerClassName = ["lightboxInner", glyphPreviewBackground ? "glyphAssetLightbox" : "", glyphPreviewClassName(glyphPreviewBackground)]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="lightbox" onClick={onClose}>
      <div className={innerClassName} onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSource} alt={asset.title || asset.id} />
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
            <div className="assetReferenceAction lightboxReferenceAction">
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
            </div>
            <button onClick={() => onSendToWorkspace(asset, "erase")}>
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
            </button>
            <button onClick={() => onDownload(asset)}>
              <Download size={15} />
              Image
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
