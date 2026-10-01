import { Check, ChevronDown, ImagePlus, Trash2, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import type { Size } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import {
  FLUX3_BOX_ACTIONS,
  boxActionLabels,
  isSmallBox,
  type Flux3BoxAction,
  type Flux3ImageRegion
} from "@/lib/flux3-image-boxes";
import { defaultMoveTarget, type regionCardPlacement } from "@/lib/flux3-image-regions";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

/** Edit boxes have actions and references; layout boxes only say what goes in them. */
export type BoxVariant = "edit" | "layout";

const placeholders: Record<Flux3BoxAction, string> = {
  change: "What it should look like after the edit",
  keep: "What is here, to keep exactly (optional)",
  move: "What moves; drag the dashed box to its new place",
  remove: "What to remove"
};

const actionTitles: Record<Flux3BoxAction, string> = {
  change: "Generate the description in this box: add, replace or recolour",
  keep: "Anchor what is here so it stays exactly where it is",
  move: "Move or resize what is here to the dashed target box",
  remove: "Remove what is here; the model fills in what was behind it"
};

type RegionCardProps = {
  region: Flux3ImageRegion;
  index: number;
  variant: BoxVariant;
  /** The pixel size of the frame the box is drawn on. */
  frame: Size;
  /** The output tier, which sets how many pixels the box gets. */
  resolution: string;
  reference: AssetRecord | null;
  placement: ReturnType<typeof regionCardPlacement>;
  onChange: (region: Flux3ImageRegion) => void;
  onReference: (payload: string, files: File[]) => void;
  onDone: () => void;
  onRemove: () => void;
};

/**
 * The selected box's card, opening below or above it: its action, what it
 * should hold, and for a change an optional reference image to take the
 * element from. Dragging an image over the card opens its drop area.
 */
export function RegionCard({ region, index, variant, frame, resolution, reference, placement, onChange, onReference, onDone, onRemove }: RegionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const takesReference = variant === "edit" && region.action === "change";

  function handleDrop(event: ReactDragEvent) {
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    setDragOver(false);
    if (!takesReference || (!payload && !files.length)) return;
    event.preventDefault();
    // Otherwise the stage takes the drop as a new source image.
    event.stopPropagation();
    onReference(payload, files);
  }

  function setAction(action: Flux3BoxAction) {
    const target = action === "move" ? region.target ?? defaultMoveTarget(region, frame) : null;
    onChange({ ...region, action, target, referenceId: action === "change" ? region.referenceId : null });
  }

  return (
    <div
      className={`regionCard ${placement.vertical} ${placement.horizontal}`}
      onPointerDown={(event) => event.stopPropagation()}
      onDragOver={(event) => {
        if (!takesReference || !isSourceDrag(event)) return;
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
        <span>Box {index + 1}</span>
        <button type="button" title="Done" onClick={onDone}>
          <Check size={14} />
        </button>
        <button type="button" title="Delete box" onClick={onRemove}>
          <Trash2 size={14} />
        </button>
      </div>
      {variant === "edit" && (
        <div className="regionCardActions" role="group" aria-label={`What box ${index + 1} does`}>
          {FLUX3_BOX_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className={region.action === action ? "active" : undefined}
              aria-pressed={region.action === action}
              title={actionTitles[action]}
              onClick={() => setAction(action)}
            >
              {boxActionLabels[action]}
            </button>
          ))}
        </div>
      )}
      <div className="regionCardRow">
        <textarea
          rows={2}
          value={region.prompt}
          placeholder={variant === "layout" ? "What goes in this box" : placeholders[region.action]}
          aria-label={`Description for box ${index + 1}`}
          onChange={(event) => onChange({ ...region, prompt: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone();
          }}
        />
        {takesReference && (
          <button
            type="button"
            className={reference ? "regionCardImage filled" : "regionCardImage"}
            aria-expanded={expanded}
            title={reference ? "Reference image" : "Take the element from a reference image"}
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
        )}
      </div>
      {(variant === "layout" || region.action === "change") && isSmallBox(region, frame, resolution) && (
        <p className="regionCardWarning">New elements this small often do not appear; make the box larger.</p>
      )}
      {takesReference && expanded && (
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
                <span>Drop the image to take this element from, or choose one</span>
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
        </div>
      )}
    </div>
  );
}
