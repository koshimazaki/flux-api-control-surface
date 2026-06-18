import { Plus } from "lucide-react";
import type { ImageOption } from "@/lib/audio-script";
import { BFL_IMAGE_OPTION_MIME } from "@/lib/reference-drag";

type ImagePoolProps = {
  imageOptions: ImageOption[];
  selectedMarkerId: string;
  onOpenImageOption: (option: ImageOption) => void;
  onAssignImage: (markerId: string, option: ImageOption) => void;
};

export function ImagePool(props: ImagePoolProps) {
  const { imageOptions, selectedMarkerId, onOpenImageOption, onAssignImage } = props;

  return (
    <aside className="audioPoolPanel">
      <div className="runLogHeader">
        <span>Image pool</span>
        <small>{imageOptions.length} refs</small>
      </div>
      <div className="audioImagePool">
        {imageOptions.map((option) => (
          <article
            className="audioImagePoolItem"
            key={option.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(BFL_IMAGE_OPTION_MIME, option.id);
              event.dataTransfer.setData("text/plain", option.id);
            }}
            title={option.name}
          >
            <button type="button" className="audioImagePreviewButton" onClick={() => onOpenImageOption(option)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={option.imageDataUrl} alt={option.name} />
              <span>{option.name}</span>
            </button>
            <button
              type="button"
              className="audioImageAssignButton"
              onClick={() => selectedMarkerId && onAssignImage(selectedMarkerId, option)}
              disabled={!selectedMarkerId}
              title="Assign to selected timing spot"
            >
              <Plus size={13} />
              <span>{option.source}</span>
            </button>
          </article>
        ))}
        {!imageOptions.length && <div className="scriptEmpty">Gallery and collection images appear here.</div>}
      </div>
    </aside>
  );
}
