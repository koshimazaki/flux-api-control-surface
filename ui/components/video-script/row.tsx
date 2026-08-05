import { AlertTriangle, Copy, GripVertical, PencilLine, RotateCcw, Trash2 } from "lucide-react";
import type { DragEvent } from "react";
import { VideoScriptAssetSlot } from "@/components/video-script/asset-slot";
import { assetPreviewSrc } from "@/lib/video-script/sources";
import type { AssetRecord } from "@/lib/types";
import type { VideoScriptPlanRow } from "@/lib/video-script-plan";
import type { VideoScriptEditorRow } from "@/lib/video-script/types";
import { VIDEO_SCRIPT_ROW_MIME } from "@/lib/video-script/types";

/**
 * One matrix row: one FLUX.3 image-to-video job. The row surfaces its own
 * provenance — generator output or hand edited — because that badge is what
 * makes "Regenerate" safe to press.
 */
export type VideoScriptRowProps = {
  row: VideoScriptEditorRow;
  index: number;
  slotCount: number;
  assets: Map<string, AssetRecord>;
  planRow?: VideoScriptPlanRow;
  timing?: number[];
  onSetSlot: (slotIndex: number, assetId: string | null) => void;
  onMoveSlot: (from: number, to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onResetEdits: () => void;
  onReorder: (from: number, to: number) => void;
  onEditTiming: () => void;
};

export function VideoScriptRow(props: VideoScriptRowProps) {
  const { row, slotCount } = props;
  const errors = props.planRow?.errors || [];
  const timing = row.timingOverride || props.timing;

  function handleRowDrop(event: DragEvent) {
    const raw = event.dataTransfer.getData(VIDEO_SCRIPT_ROW_MIME);
    if (raw === "") return;
    const from = Number(raw);
    if (!Number.isInteger(from) || from === props.index) return;
    event.preventDefault();
    props.onReorder(from, props.index);
  }

  return (
    <article
      className={errors.length ? "videoScriptRow invalid" : "videoScriptRow"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleRowDrop}
    >
      <header>
        <span
          className="videoScriptRowGrip"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(VIDEO_SCRIPT_ROW_MIME, String(props.index));
            event.dataTransfer.effectAllowed = "move";
          }}
          title="Drag to reorder"
        >
          <GripVertical size={13} />
          {props.index + 1}
        </span>
        {row.edited ? (
          <span className="videoScriptBadge edited" title="Regenerate will not replace this row">
            <PencilLine size={11} />
            {row.origin === "manual" ? "manual" : "edited"}
          </span>
        ) : (
          <span className="videoScriptBadge generated">generated</span>
        )}
        {typeof props.planRow?.estimatedUsd === "number" && (
          <small>${props.planRow.estimatedUsd.toFixed(2)}</small>
        )}
        <div className="videoScriptRowActions">
          <button type="button" onClick={props.onEditTiming} title="Per-row timeline override">
            timing
          </button>
          {row.edited && (
            <button type="button" onClick={props.onResetEdits} title="Discard this row's edit protection">
              <RotateCcw size={12} />
            </button>
          )}
          <button type="button" onClick={props.onDuplicate} title="Duplicate row">
            <Copy size={12} />
          </button>
          <button type="button" onClick={props.onDelete} title="Delete row">
            <Trash2 size={12} />
          </button>
        </div>
      </header>

      <div className="videoScriptRowSlots">
        {Array.from({ length: slotCount }, (_, slotIndex) => {
          const assetId = row.slots[slotIndex] ?? null;
          const asset = assetId ? props.assets.get(assetId) : undefined;
          const seconds = timing?.[slotIndex];
          return (
            <VideoScriptAssetSlot
              key={slotIndex}
              variant="cell"
              assetId={assetId}
              previewSrc={assetId ? assetPreviewSrc(asset, assetId) : undefined}
              label={slotIndex + 1}
              hint={typeof seconds === "number" && Number.isFinite(seconds) ? `${seconds}s` : undefined}
              title={assetId ? asset?.title || assetId : "Drop an image to set this keyframe"}
              onDropAsset={(dropped) => props.onSetSlot(slotIndex, dropped)}
              onClear={assetId ? () => props.onSetSlot(slotIndex, null) : undefined}
              onMove={(direction) => props.onMoveSlot(slotIndex, slotIndex + direction)}
              canMoveEarlier={slotIndex > 0}
              canMoveLater={slotIndex < slotCount - 1}
            />
          );
        })}
      </div>

      {errors.length > 0 && (
        <ul className="videoScriptRowErrors">
          {errors.map((error) => (
            <li key={error.code}>
              <AlertTriangle size={11} />
              {error.message}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
