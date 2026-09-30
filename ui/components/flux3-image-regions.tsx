import { X } from "lucide-react";
import type { CSSProperties } from "react";
import type { Size } from "@/lib/canvas-geometry";
import { FLUX3_IMAGE_FUZZ_MAX, clampFuzz, type Flux3ImageBox } from "@/lib/flux3-image";

type RegionBoxLayerProps = {
  boxes: Flux3ImageBox[];
  size: Size;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Flux3ImageBox>) => void;
  onRemove: (id: string) => void;
};

function percent(value: number, total: number) {
  return `${(value / Math.max(1, total)) * 100}%`;
}

/**
 * Bounding boxes drawn over the source image. Each box carries its edit, typed
 * straight into the box, and shows its fuzz radius as a soft outer edge. The
 * layer lets pointer events through, so new boxes can be drawn over old ones.
 */
export function RegionBoxLayer({ boxes, size, activeId, onSelect, onChange, onRemove }: RegionBoxLayerProps) {
  return (
    <div className="regionBoxLayer">
      {boxes.map((box, index) => {
        const style = {
          left: percent(box.x, size.width),
          top: percent(box.y, size.height),
          width: percent(box.width, size.width),
          height: percent(box.height, size.height),
          "--fuzz-x": percent(box.fuzz, box.width),
          "--fuzz-y": percent(box.fuzz, box.height)
        } as CSSProperties;
        return (
          <div
            key={box.id}
            data-box-id={box.id}
            className={[
              "regionBox",
              box.id === activeId ? "active" : "",
              // Boxes in the right half open their tag leftward, so it stays on the image.
              box.x + box.width / 2 > size.width / 2 ? "tagEnd" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            style={style}
          >
            <span className="regionBoxFuzz" aria-hidden="true" />
            <div className="regionBoxTag" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" className="regionBoxIndex" onClick={() => onSelect(box.id)} title="Select box">
                {index + 1}
              </button>
              <input
                value={box.prompt}
                placeholder="Type the edit…"
                aria-label={`Edit for box ${index + 1}`}
                onFocus={() => onSelect(box.id)}
                onChange={(event) => onChange(box.id, { prompt: event.target.value })}
              />
              <button type="button" onClick={() => onRemove(box.id)} title={`Remove box ${index + 1}`}>
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type RegionBoxListProps = Omit<RegionBoxLayerProps, "size">;

/** The same boxes as a list in the controls: edit text and fuzz radius per box. */
export function RegionBoxList({ boxes, activeId, onSelect, onChange, onRemove }: RegionBoxListProps) {
  if (!boxes.length) return <p className="toolStubNote">Drag on the image to draw a box, then type the edit into it.</p>;
  return (
    <ol className="regionBoxList">
      {boxes.map((box, index) => (
        <li key={box.id} className={box.id === activeId ? "active" : undefined} onFocus={() => onSelect(box.id)}>
          <div className="regionBoxListHeader">
            <strong>Box {index + 1}</strong>
            <span>
              {box.width}×{box.height} at {box.x},{box.y}
            </span>
            <button type="button" onClick={() => onRemove(box.id)} title={`Remove box ${index + 1}`}>
              <X size={12} />
            </button>
          </div>
          <input
            value={box.prompt}
            placeholder="Type the edit…"
            aria-label={`Edit for box ${index + 1}`}
            onChange={(event) => onChange(box.id, { prompt: event.target.value })}
          />
          <label>
            Fuzz · {box.fuzz}px
            <input
              type="range"
              min={0}
              max={FLUX3_IMAGE_FUZZ_MAX}
              value={box.fuzz}
              onChange={(event) => onChange(box.id, { fuzz: clampFuzz(Number(event.target.value)) })}
            />
          </label>
        </li>
      ))}
    </ol>
  );
}
