import { ArrowLeft, ArrowRight, ImagePlus, X } from "lucide-react";
import type { DragEvent, ReactNode } from "react";
import { readAssetDragId, readPoolDragId } from "@/lib/video-script/types";

/**
 * Generic image slot, extracted from the VTO/FLUX.3 drop affordances so the
 * keyframe matrix reuses the gesture without inheriting garment-specific state.
 *
 * `variant` is what keeps the two matrix drop targets from being one ambiguous
 * gesture: a `column` slot binds a pool to a keyframe position for generation,
 * a `cell` slot overrides a single row.
 */
export type VideoScriptAssetSlotProps = {
  variant: "cell" | "column";
  assetId: string | null;
  previewSrc?: string;
  label: ReactNode;
  hint?: string;
  title?: string;
  highlighted?: boolean;
  onDropAsset?: (assetId: string) => void;
  onDropPool?: (poolId: string) => void;
  onClear?: () => void;
  onMove?: (direction: -1 | 1) => void;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  children?: ReactNode;
};

export function VideoScriptAssetSlot(props: VideoScriptAssetSlotProps) {
  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const poolId = readPoolDragId(event.dataTransfer);
    if (poolId) {
      props.onDropPool?.(poolId);
      return;
    }
    const assetId = readAssetDragId(event.dataTransfer);
    if (assetId) props.onDropAsset?.(assetId);
  }

  const className = [
    "videoScriptSlot",
    props.variant === "column" ? "columnSlot" : "cellSlot",
    props.assetId ? "filled" : "empty",
    props.highlighted ? "bound" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} title={props.title}>
      {props.previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.previewSrc} alt={props.assetId || "keyframe"} />
      ) : (
        <ImagePlus size={16} />
      )}
      <span className="videoScriptSlotLabel">{props.label}</span>
      {props.hint && <small>{props.hint}</small>}
      {props.children}
      {(props.onMove || props.onClear) && (
        <div className="videoScriptSlotActions">
          {props.onMove && (
            <button
              type="button"
              disabled={!props.canMoveEarlier}
              onClick={() => props.onMove?.(-1)}
              title="Move earlier"
            >
              <ArrowLeft size={12} />
            </button>
          )}
          {props.onMove && (
            <button type="button" disabled={!props.canMoveLater} onClick={() => props.onMove?.(1)} title="Move later">
              <ArrowRight size={12} />
            </button>
          )}
          {props.onClear && (
            <button type="button" onClick={props.onClear} title="Clear">
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
