import { Download, ImagePlus, Send } from "lucide-react";
import type { AssetRecord } from "@/lib/types";

type LightboxProps = {
  asset: AssetRecord | null;
  onClose: () => void;
  onSendToPrompt: (asset: AssetRecord) => void;
  onSendToReference: (asset: AssetRecord) => void;
  onDownload: (asset: AssetRecord) => void;
};

export function Lightbox({ asset, onClose, onSendToPrompt, onSendToReference, onDownload }: LightboxProps) {
  if (!asset) return null;

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightboxInner" onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.imageDataUrl} alt={asset.title || asset.id} />
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
