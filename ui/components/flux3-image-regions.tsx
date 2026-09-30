import { ImagePlus, X } from "lucide-react";
import { useRef, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { Size } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { FLUX3_IMAGE_FUZZ_MAX, clampFuzz, type Flux3ImageRegion } from "@/lib/flux3-image";
import {
  REGION_RESIZE_HANDLES,
  regionKindLabel,
  regionPaths,
  resizeRegion,
  type RegionHandle
} from "@/lib/flux3-image-regions";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

type RegionCallbacks = {
  activeId: string | null;
  referenceFor: (region: Flux3ImageRegion) => AssetRecord | null;
  onSelect: (id: string) => void;
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

function RegionShapes({ regions, activeId }: { regions: Flux3ImageRegion[]; activeId: string | null }) {
  return (
    <>
      {regions.map((region) => {
        const className = region.id === activeId ? "regionShape active" : "regionShape";
        if (region.kind === "box") {
          return <rect key={region.id} className={className} x={region.x} y={region.y} width={region.width} height={region.height} />;
        }
        return regionPaths(region).map((path, index) => {
          const points = path.map((point) => `${point.x},${point.y}`).join(" ");
          return region.kind === "lasso" ? (
            <polygon key={`${region.id}-${index}`} className={className} points={points} />
          ) : (
            <polyline
              key={`${region.id}-${index}`}
              className={`${className} regionStroke`}
              points={path.length === 1 ? `${points} ${points}` : points}
              style={{ strokeWidth: region.brush }}
            />
          );
        });
      })}
    </>
  );
}

/**
 * Precise-edit regions over the source image. Shapes show what each region
 * covers; the selected region gets edge and corner handles for resizing, and
 * its number drags it. Each tag carries the region's edit and reference image.
 * The layer lets pointer events through elsewhere, so drawing continues on top.
 */
export function RegionLayer({ regions, size, ...callbacks }: RegionCallbacks & { regions: Flux3ImageRegion[]; size: Size }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ handle: RegionHandle; x: number; y: number; scale: number; origin: Flux3ImageRegion } | null>(null);

  function startDrag(event: ReactPointerEvent<HTMLElement>, region: Flux3ImageRegion, handle: RegionHandle) {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = { handle, x: event.clientX, y: event.clientY, scale: size.width / rect.width, origin: region };
    event.currentTarget.setPointerCapture(event.pointerId);
    callbacks.onSelect(region.id);
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    const dx = (event.clientX - current.x) * current.scale;
    const dy = (event.clientY - current.y) * current.scale;
    callbacks.onChange(resizeRegion(current.origin, current.handle, dx, dy, size));
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const dragHandlers = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };

  return (
    <div className="regionLayer" ref={layerRef}>
      <svg className="regionShapes" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none" aria-hidden="true">
        <RegionShapes regions={regions} activeId={callbacks.activeId} />
      </svg>
      {regions.map((region, index) => {
        const active = region.id === callbacks.activeId;
        const style = {
          left: percent(region.x, size.width),
          top: percent(region.y, size.height),
          width: percent(region.width, size.width),
          height: percent(region.height, size.height),
          "--fuzz-x": percent(region.fuzz, region.width),
          "--fuzz-y": percent(region.fuzz, region.height)
        } as CSSProperties;
        const tagEnd = region.x + region.width / 2 > size.width / 2;
        return (
          <div
            key={region.id}
            data-region-id={region.id}
            className={["regionFrame", region.kind, active ? "active" : "", tagEnd ? "tagEnd" : ""].filter(Boolean).join(" ")}
            style={style}
          >
            <span className="regionFuzz" aria-hidden="true" />
            {active &&
              REGION_RESIZE_HANDLES.map((handle) => (
                <span
                  key={handle}
                  className={`regionHandle regionHandle-${handle}`}
                  onPointerDown={(event) => startDrag(event, region, handle)}
                  {...dragHandlers}
                />
              ))}
            <div className="regionTag" onPointerDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="regionIndex"
                title="Select, or drag to move"
                onPointerDown={(event) => startDrag(event, region, "move")}
                {...dragHandlers}
              >
                {index + 1}
              </button>
              <input
                value={region.prompt}
                placeholder="Type the edit…"
                aria-label={`Edit for region ${index + 1}`}
                onFocus={() => callbacks.onSelect(region.id)}
                onChange={(event) => callbacks.onChange({ ...region, prompt: event.target.value })}
              />
              <RegionReference
                asset={callbacks.referenceFor(region)}
                label={`Reference for region ${index + 1}`}
                onAdd={(payload, files) => callbacks.onReference(region.id, payload, files)}
                onClear={() => callbacks.onChange({ ...region, referenceId: null })}
              />
              <button type="button" onClick={() => callbacks.onRemove(region.id)} title={`Remove region ${index + 1}`}>
                <X size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The regions as a list in the controls: edit, reference image and fuzz per region. */
export function RegionList({ regions, ...callbacks }: RegionCallbacks & { regions: Flux3ImageRegion[] }) {
  if (!regions.length) {
    return (
      <p className="toolStubNote">
        Draw a region on the image with the box, brush or lasso, then type its edit and drop a reference on it if you
        want one.
      </p>
    );
  }
  return (
    <ol className="regionList">
      {regions.map((region, index) => (
        <li
          key={region.id}
          className={region.id === callbacks.activeId ? "active" : undefined}
          onFocus={() => callbacks.onSelect(region.id)}
          onClick={() => callbacks.onSelect(region.id)}
        >
          <div className="regionListHeader">
            <strong>Region {index + 1}</strong>
            <span>
              {regionKindLabel(region.kind)} · {region.width}×{region.height} at {region.x},{region.y}
            </span>
            <button type="button" onClick={() => callbacks.onRemove(region.id)} title={`Remove region ${index + 1}`}>
              <X size={12} />
            </button>
          </div>
          <input
            value={region.prompt}
            placeholder="Type the edit…"
            aria-label={`Edit for region ${index + 1}`}
            onChange={(event) => callbacks.onChange({ ...region, prompt: event.target.value })}
          />
          <div className="regionListControls">
            <RegionReference
              asset={callbacks.referenceFor(region)}
              label={`Reference for region ${index + 1}`}
              onAdd={(payload, files) => callbacks.onReference(region.id, payload, files)}
              onClear={() => callbacks.onChange({ ...region, referenceId: null })}
            />
            <label>
              Fuzz · {region.fuzz}px
              <input
                type="range"
                min={0}
                max={FLUX3_IMAGE_FUZZ_MAX}
                value={region.fuzz}
                onChange={(event) => callbacks.onChange({ ...region, fuzz: clampFuzz(Number(event.target.value)) })}
              />
            </label>
          </div>
        </li>
      ))}
    </ol>
  );
}
