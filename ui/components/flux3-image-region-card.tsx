import { Check, ChevronDown, ImagePlus, Trash2, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import { assetImageSource } from "@/lib/dashboard-tools";
import { FLUX3_IMAGE_FUZZ_MAX, clampFuzz, type Flux3ImageRegion } from "@/lib/flux3-image";
import type { regionCardPlacement } from "@/lib/flux3-image-regions";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

type RegionCardProps = {
  region: Flux3ImageRegion;
  index: number;
  reference: AssetRecord | null;
  placement: ReturnType<typeof regionCardPlacement>;
  onChange: (region: Flux3ImageRegion) => void;
  onReference: (payload: string, files: File[]) => void;
  onDone: () => void;
  onRemove: () => void;
};

/**
 * The selected region's card, opening below or above it: the edit, a
 * reference image button, and a chevron that expands a large drop area and the
 * fuzz radius. Dragging an image over the card expands it on its own.
 */
export function RegionCard({ region, index, reference, placement, onChange, onReference, onDone, onRemove }: RegionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(event: ReactDragEvent) {
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    setDragOver(false);
    if (!payload && !files.length) return;
    event.preventDefault();
    // Otherwise the stage takes the drop as a new source image.
    event.stopPropagation();
    onReference(payload, files);
  }

  return (
    <div
      className={`regionCard ${placement.vertical} ${placement.horizontal}`}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => {
        if (!isSourceDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setDragOver(true);
        setExpanded(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <div className="regionCardHeader">
        <span>Region {index + 1}</span>
        <button type="button" title="Done" onClick={onDone}>
          <Check size={14} />
        </button>
        <button type="button" title="Delete region" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>
      <div className="regionCardRow">
        <textarea
          rows={2}
          value={region.prompt}
          placeholder="What should change here?"
          aria-label={`Edit for region ${index + 1}`}
          onChange={(event) => onChange({ ...region, prompt: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone();
          }}
        />
        <button
          type="button"
          className={reference ? "regionCardImage filled" : "regionCardImage"}
          aria-expanded={expanded}
          title={reference ? "Reference image and fuzz" : "Add a reference image"}
          onClick={() => setExpanded((open) => !open)}
        >
          {reference ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetImageSource(reference)} alt="" />
          ) : (
            <ImagePlus size={16} />
          )}
          <ChevronDown className="regionCardChevron" size={11} />
        </button>
      </div>
      {expanded && (
        <div className="regionCardMore">
          <div className={["regionDropArea", dragOver ? "over" : "", reference ? "filled" : ""].filter(Boolean).join(" ")}>
            {reference ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetImageSource(reference)} alt={reference.title || reference.id} />
                <span>{reference.title || reference.id}</span>
                <button type="button" title="Remove the reference" onClick={() => onChange({ ...region, referenceId: null })}>
                  <X size={12} />
                </button>
              </>
            ) : (
              <label>
                <ImagePlus size={20} />
                <span>Drop a reference image here, or choose one</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    event.target.value = "";
                    if (files.length) onReference("", files);
                  }}
                />
              </label>
            )}
          </div>
          <label className="regionCardFuzz">
            Fuzz · {region.fuzz}px
            <input
              type="range"
              min={0}
              max={FLUX3_IMAGE_FUZZ_MAX}
              value={region.fuzz}
              onChange={(event) => onChange({ ...region, fuzz: clampFuzz(Number(event.target.value)) })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
