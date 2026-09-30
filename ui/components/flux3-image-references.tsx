import { ImagePlus, X } from "lucide-react";
import type { ChangeEvent, DragEvent as ReactDragEvent } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { assetImageSource } from "@/lib/dashboard-tools";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

type Flux3ImageReferenceSlotsProps = {
  slots: (AssetRecord | null)[];
  onAdd: (index: number, payload: string, files: File[]) => void;
  onRemove: (index: number) => void;
};

/**
 * Numbered reference slots for image to image. Each slot takes an asset or
 * reference dragged from the dashboard, a dropped file, or a chosen file;
 * several files fill the following empty slots. The prompt can name them as
 * image 1, image 2 and so on.
 */
export function Flux3ImageReferenceSlots({ slots, onAdd, onRemove }: Flux3ImageReferenceSlotsProps) {
  function handleDrop(event: ReactDragEvent, index: number) {
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    if (!payload && !files.length) return;
    event.preventDefault();
    // The stage behind the slots would otherwise take the drop as its source image.
    event.stopPropagation();
    onAdd(index, payload, files);
  }

  function handleChoose(event: ChangeEvent<HTMLInputElement>, index: number) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length) onAdd(index, "", files);
  }

  return (
    <div className="flux3ReferenceGrid">
      {slots.map((asset, index) => (
        <div
          key={index}
          className={asset ? "flux3ReferenceSlot filled" : "flux3ReferenceSlot"}
          onDragOver={(event) => {
            if (!isSourceDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => handleDrop(event, index)}
        >
          <span className="flux3ReferenceIndex">Image {index + 1}</span>
          {asset ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assetImageSource(asset)} alt={asset.title || asset.id} />
              <span className="flux3ReferenceName">{asset.title || asset.id}</span>
              <IconButton className="flux3ReferenceRemove" title={`Remove image ${index + 1}`} onClick={() => onRemove(index)}>
                <X size={13} />
              </IconButton>
            </>
          ) : (
            <label className="flux3ReferenceEmpty">
              <ImagePlus size={22} />
              <span>Drop or choose</span>
              <input type="file" accept="image/*" multiple hidden onChange={(event) => handleChoose(event, index)} />
            </label>
          )}
        </div>
      ))}
    </div>
  );
}
