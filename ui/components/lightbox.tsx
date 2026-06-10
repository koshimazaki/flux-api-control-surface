import { Download, Eraser, Fingerprint, ImagePlus, Maximize2, Paintbrush, Send } from "lucide-react";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;

type LightboxProps = {
  asset: AssetRecord | null;
  onClose: () => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToWorkspace: (asset: AssetRecord, mode: ImageToolMode) => void;
  onSendToReference: (asset: AssetRecord) => void;
  onDownload: (asset: AssetRecord) => void;
};

export function Lightbox({ asset, onClose, onSendToPrompt, onSendToWorkspace, onSendToReference, onDownload }: LightboxProps) {
  if (!asset) return null;
  const imageSource = asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url;

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightboxInner" onClick={(event) => event.stopPropagation()}>
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
            <button onClick={() => onSendToReference(asset)}>
              <ImagePlus size={15} />
              Reference
            </button>
            <button onClick={() => onSendToWorkspace(asset, "erase")}>
              <Eraser size={15} />
              Erase
            </button>
            <button onClick={() => onSendToWorkspace(asset, "inpaint")}>
              <Paintbrush size={15} />
              Inpaint
            </button>
            <button onClick={() => onSendToWorkspace(asset, "outpaint")}>
              <Maximize2 size={15} />
              Outpaint
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
