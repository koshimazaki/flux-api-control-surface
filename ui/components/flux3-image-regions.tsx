import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { RegionCard, type BoxVariant } from "@/components/flux3-image-region-card";
import type { Size } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { FLUX3_BOX_ACTIONS, boxActionLabels, type Flux3Box, type Flux3BoxAction, type Flux3ImageRegion } from "@/lib/flux3-image-boxes";
import {
  boxColor,
  boxLayers,
  defaultMoveTarget,
  dragResult,
  fillsFrame,
  regionCardPlacement,
  resizeRegion,
  type BoxDrag,
  type BoxPart,
  type RegionHandle
} from "@/lib/flux3-image-regions";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

type RegionCallbacks = {
  /** Edit boxes have actions and references; layout boxes only a description. */
  variant: BoxVariant;
  /** The output tier, for the small-box warning. */
  resolution: string;
  activeId: string | null;
  referenceFor: (region: Flux3ImageRegion) => AssetRecord | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onChange: (region: Flux3ImageRegion) => void;
  onRemove: (id: string) => void;
  onReference: (id: string, payload: string, files: File[]) => void;
};

type RegionReferenceProps = {
  asset: AssetRecord | null;
  label: string;
  onAdd: (payload: string, files: File[]) => void;
  onClear: () => void;
};

/** A region's reference image: drop an asset or file on it, or choose one. */
function RegionReference({ asset, label, onAdd, onClear }: RegionReferenceProps) {
  function handleDrop(event: ReactDragEvent) {
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    if (!payload && !files.length) return;
    event.preventDefault();
    // Otherwise the stage takes the drop as a new source image.
    event.stopPropagation();
    onAdd(payload, files);
  }
  return (
    <div
      className={asset ? "regionReference filled" : "regionReference"}
      title={asset ? `${label}: ${asset.title || asset.id}` : `${label}: drop or choose an image`}
      onDragOver={(event) => {
        if (!isSourceDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onDrop={handleDrop}
    >
      {asset ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetImageSource(asset)} alt={asset.title || asset.id} />
          <button type="button" onClick={onClear} title={`Remove the ${label.toLowerCase()}`}>
            <X size={10} />
          </button>
        </>
      ) : (
        <label>
          <ImagePlus size={13} />
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              if (files.length) onAdd("", files);
            }}
          />
        </label>
      )}
    </div>
  );
}

function percent(value: number, total: number) {
  return `${(value / Math.max(1, total)) * 100}%`;
}

function frameStyle(box: Flux3Box, size: Size, color: string, layer: number) {
  return {
    left: percent(box.x, size.width),
    top: percent(box.y, size.height),
    width: percent(box.width, size.width),
    height: percent(box.height, size.height),
    zIndex: layer,
    "--box-color": color
  } as CSSProperties;
}

/** Dashed lines from each moving box to its target, under the frames. */
function MoveLines({ regions }: { regions: Flux3ImageRegion[] }) {
  return (
    <>
      {regions
        .map((region, index) => ({ region, color: boxColor(index) }))
        .filter(({ region }) => region.action === "move" && region.target)
        .map(({ region, color }) => {
          const target = region.target!;
          return (
            <line
              key={region.id}
              className="regionMoveLine"
              style={{ stroke: color }}
              x1={region.x + region.width / 2}
              y1={region.y + region.height / 2}
              x2={target.x + target.width / 2}
              y2={target.y + target.height / 2}
            />
          );
        })}
    </>
  );
}

/** Whether a key press is typing into a field rather than acting on the page. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

const NUDGES: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type BoxKeyOptions = {
  activeId: string | null;
  /** Whether the boxes are on screen at all. */
  enabled: boolean;
  regions: Flux3ImageRegion[];
  frame: Size | null;
  onChange: (region: Flux3ImageRegion) => void;
  onRemove: (id: string) => void;
};

/**
 * Keys for the selected box while the boxes are on screen: Delete or
 * Backspace removes it, the arrows nudge it by 1% of the frame (Shift: 5%).
 * Nothing happens while a field has the keyboard, where those keys edit text.
 */
export function useBoxKeys(options: BoxKeyOptions) {
  const latest = useRef(options);
  latest.current = options;
  const { activeId, enabled } = options;
  useEffect(() => {
    if (!activeId || !enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const { regions, frame, onChange, onRemove } = latest.current;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onRemove(activeId);
        return;
      }
      const nudge = NUDGES[event.key];
      const region = regions.find((item) => item.id === activeId);
      if (!nudge || !region || !frame) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.05 : 0.01;
      onChange(resizeRegion(region, "source", "move", nudge[0] * step * frame.width, nudge[1] * step * frame.height, frame));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, enabled]);
}

const CORNER_HANDLES: RegionHandle[] = ["nw", "ne", "se", "sw"];
const EDGE_HANDLES: RegionHandle[] = ["n", "e", "s", "w"];

/**
 * FLUX 3 Image boxes over the frame they are drawn on, kept light: a frame in
 * the box's own colour and a small chip per box. Pressing inside a box selects
 * it and dragging moves it; the selected box gets edge and corner handles and
 * its card, and a move also shows its dashed target box, which drags the same
 * way. Smaller boxes sit above larger ones. Holding Shift lets drags through
 * to draw a new box over existing ones, and a box that fills the
 * frame lets them through anyway, since it has nowhere to move.
 */
export function RegionLayer({ regions, size, ...callbacks }: RegionCallbacks & { regions: Flux3ImageRegion[]; size: Size }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<BoxDrag | null>(null);
  const [drawThrough, setDrawThrough] = useState(false);
  const layers = boxLayers(regions);

  // Shift held: the boxes let drags through, to draw a new box over them.
  // (Alt-drag already pans the canvas.)
  useEffect(() => {
    const track = (event: KeyboardEvent) => setDrawThrough(event.shiftKey);
    const release = () => setDrawThrough(false);
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
      window.removeEventListener("blur", release);
    };
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLElement>, region: Flux3ImageRegion, part: BoxPart, handle: RegionHandle) {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    event.preventDefault();
    event.stopPropagation();
    // Pressing the box means working on the box: leave any description being typed, so Delete acts on the box.
    const typing = document.activeElement;
    if (typing instanceof HTMLElement && typing.matches("input, textarea, select, [contenteditable]")) typing.blur();
    drag.current = { part, handle, x: event.clientX, y: event.clientY, scale: size.width / rect.width, origin: region };
    event.currentTarget.setPointerCapture(event.pointerId);
    callbacks.onSelect(region.id);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    callbacks.onChange(dragResult(current, event.clientX, event.clientY, size));
  }

  /** The box ends where the pointer lifts, even if no move was delivered there. */
  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    callbacks.onChange(dragResult(current, event.clientX, event.clientY, size));
  }

  /** A cancelled gesture (the browser took the pointer) puts the box back where it started. */
  function cancelDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    callbacks.onChange(current.origin);
  }

  const dragHandlers = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: cancelDrag };
  const handles = (region: Flux3ImageRegion, part: BoxPart) =>
    [...EDGE_HANDLES, ...CORNER_HANDLES].map((handle) => (
      <span
        key={handle}
        className={`regionHandle regionHandle-${handle}${handle.length === 1 ? " edge" : ""}`}
        onPointerDown={(event) => startDrag(event, region, part, handle)}
        {...dragHandlers}
      />
    ));

  return (
    <div className={drawThrough ? "regionLayer drawThrough" : "regionLayer"} ref={layerRef}>
      <svg className="regionShapes" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none" aria-hidden="true">
        <MoveLines regions={regions} />
      </svg>
      {regions.map((region, index) => {
        const active = region.id === callbacks.activeId;
        const color = boxColor(index);
        // The selected box rides above the rest, with its handles and card.
        const layer = active ? regions.length + 1 : layers[index];
        const reference = callbacks.referenceFor(region);
        const action = callbacks.variant === "layout" ? "change" : region.action;
        return (
          <div key={region.id} className="regionPair">
            {action === "move" && region.target && (
              <div
                className={["regionFrame", "regionTarget", active ? "active" : ""].filter(Boolean).join(" ")}
                style={frameStyle(region.target, size, color, layer)}
                title={`Where box ${index + 1} moves to`}
                onPointerDown={(event) => startDrag(event, region, "target", "move")}
                {...dragHandlers}
              >
                {active && handles(region, "target")}
                <span className="regionTargetLabel">{index + 1} →</span>
              </div>
            )}
            <div
              data-region-id={region.id}
              className={["regionFrame", `action-${action}`, active ? "active" : "", !active && fillsFrame(region, size) ? "passThrough" : ""]
                .filter(Boolean)
                .join(" ")}
              style={frameStyle(region, size, color, layer)}
              onPointerDown={(event) => startDrag(event, region, "source", "move")}
              {...dragHandlers}
            >
              {active && handles(region, "source")}
              <div className="regionChip" onPointerDown={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="regionIndex"
                  title="Select, or drag to move"
                  onPointerDown={(event) => startDrag(event, region, "source", "move")}
                  {...dragHandlers}
                >
                  {index + 1}
                </button>
                <button type="button" className="regionChipText" onClick={() => callbacks.onSelect(region.id)}>
                  <span>
                    {callbacks.variant === "edit" ? `${boxActionLabels[action]}: ` : ""}
                    {region.prompt.trim() || (action === "keep" ? "kept as is" : "no description yet")}
                  </span>
                </button>
                {reference && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="regionChipThumb" src={assetImageSource(reference)} alt="" />
                )}
              </div>
              {active && (
                <RegionCard
                  region={region}
                  index={index}
                  variant={callbacks.variant}
                  frame={size}
                  resolution={callbacks.resolution}
                  reference={reference}
                  placement={regionCardPlacement(region, size)}
                  onChange={callbacks.onChange}
                  onReference={(payload, files) => callbacks.onReference(region.id, payload, files)}
                  onDone={callbacks.onDeselect}
                  onRemove={() => callbacks.onRemove(region.id)}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The boxes as a list in the controls: action, description and reference per box. */
export function RegionList({ regions, frame, ...callbacks }: RegionCallbacks & { regions: Flux3ImageRegion[]; frame: Size | null }) {
  if (!regions.length) {
    return (
      <p className="toolStubNote">
        {callbacks.variant === "layout"
          ? "Drag boxes on the frame to place each element, then say what goes in each."
          : "Drag a box on the image for each thing to change, keep, move or remove, then describe it."}
      </p>
    );
  }
  function setAction(region: Flux3ImageRegion, action: Flux3BoxAction) {
    const target = action === "move" ? region.target ?? (frame ? defaultMoveTarget(region, frame) : null) : null;
    callbacks.onChange({ ...region, action, target, referenceId: action === "change" ? region.referenceId : null });
  }
  return (
    <ol className="regionList">
      {regions.map((region, index) => (
        <li
          key={region.id}
          className={region.id === callbacks.activeId ? "active" : undefined}
          style={{ "--box-color": boxColor(index) } as CSSProperties}
          onFocus={() => callbacks.onSelect(region.id)}
          onClick={() => callbacks.onSelect(region.id)}
        >
          <div className="regionListHeader">
            <strong>Box {index + 1}</strong>
            <span>
              {region.width}×{region.height} at {region.x},{region.y}
            </span>
            <button type="button" onClick={() => callbacks.onRemove(region.id)} title={`Remove box ${index + 1}`}>
              <X size={12} />
            </button>
          </div>
          {callbacks.variant === "edit" && (
            <select
              value={region.action}
              aria-label={`What box ${index + 1} does`}
              onChange={(event) => setAction(region, event.target.value as Flux3BoxAction)}
            >
              {FLUX3_BOX_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {boxActionLabels[action]}
                </option>
              ))}
            </select>
          )}
          <input
            value={region.prompt}
            placeholder={callbacks.variant === "layout" ? "What goes here…" : "Describe it…"}
            aria-label={`Description for box ${index + 1}`}
            onChange={(event) => callbacks.onChange({ ...region, prompt: event.target.value })}
          />
          {callbacks.variant === "edit" && region.action === "change" && (
            <div className="regionListControls">
              <RegionReference
                asset={callbacks.referenceFor(region)}
                label={`Reference for box ${index + 1}`}
                onAdd={(payload, files) => callbacks.onReference(region.id, payload, files)}
                onClear={() => callbacks.onChange({ ...region, referenceId: null })}
              />
              <span className="regionListHint">Optional: take the element from this image</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
