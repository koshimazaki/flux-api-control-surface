import { ChevronDown, ChevronUp, ImagePlus, Images, Target, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { assetImageSource } from "@/lib/dashboard-tools";
import type { Flux3ImageMode, Flux3ImageRegion } from "@/lib/flux3-image";
import { regionKindLabel } from "@/lib/flux3-image-regions";
import { dragPayloadFromTransfer, imageFilesFromTransfer } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";
import { useDockVisibility } from "@/lib/use-dock-visibility";

type DockSlot = {
  key: string;
  label: string;
  token: string;
  hint: string;
  asset: AssetRecord | null;
  onDrop: (payload: string, files: File[]) => void;
  onClear: () => void;
};

type Flux3ImageDockProps = {
  mode: Flux3ImageMode;
  regions: Flux3ImageRegion[];
  referenceFor: (region: Flux3ImageRegion) => AssetRecord | null;
  onRegionReference: (id: string, payload: string, files: File[]) => void;
  onClearRegionReference: (id: string) => void;
  referenceSlots: (AssetRecord | null)[];
  onSlotReference: (index: number, payload: string, files: File[]) => void;
  onClearSlot: (index: number) => void;
};

/**
 * The FLUX 3 Image counterpart of the Generate reference dock: it drops in
 * from the top while the asset gallery is in view, so gallery images can be
 * dragged straight onto a precise-edit region or an image-to-image slot.
 */
export function Flux3ImageDock(props: Flux3ImageDockProps) {
  const enabled = props.mode === "precise" || props.mode === "i2i";
  const isVisible = useDockVisibility(enabled);
  const [collapsed, setCollapsed] = useState(false);
  const [dragTarget, setDragTarget] = useState("");
  if (!enabled) return null;

  const slots: DockSlot[] =
    props.mode === "precise"
      ? props.regions.map((region, index) => ({
          key: region.id,
          label: `Region ${index + 1}`,
          token: regionKindLabel(region.kind).toLowerCase(),
          hint: region.prompt.trim() || "No instruction yet",
          asset: props.referenceFor(region),
          onDrop: (payload, files) => props.onRegionReference(region.id, payload, files),
          onClear: () => props.onClearRegionReference(region.id)
        }))
      : props.referenceSlots.map((asset, index) => ({
          key: `image-${index}`,
          label: `Image ${index + 1}`,
          token: `image ${index + 1}`,
          hint: "Reference for image to image",
          asset,
          onDrop: (payload, files) => props.onSlotReference(index, payload, files),
          onClear: () => props.onClearSlot(index)
        }));
  const filled = slots.filter((slot) => slot.asset);
  const title = props.mode === "precise" ? "Region references" : "Image references";

  function handleDrop(event: ReactDragEvent, slot: DockSlot) {
    event.preventDefault();
    setDragTarget("");
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    if (payload || files.length) slot.onDrop(payload, files);
  }

  return (
    <section
      aria-hidden={!isVisible}
      className={["referenceDock", "mode-flux3-image", isVisible ? "visible" : "", collapsed ? "collapsed" : ""].join(" ")}
    >
      <div className="referenceDockHeader">
        <div>
          <span>
            {props.mode === "precise" ? <Target size={14} /> : <Images size={14} />}
            {title}
          </span>
          <strong>
            {filled.length}/{slots.length} {props.mode === "precise" ? "regions with a reference" : "refs"}
          </strong>
        </div>
        <div className="referenceDockHeaderThumbs" aria-hidden="true">
          {filled.slice(0, 5).map((slot) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetImageSource(slot.asset!)} alt="" key={slot.key} />
          ))}
        </div>
        <IconButton title={collapsed ? "Open reference dock" : "Collapse reference dock"} onClick={() => setCollapsed((open) => !open)}>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </IconButton>
      </div>
      {!collapsed && (
        <div className="referenceDockBody">
          {slots.length ? (
            <div className="referenceDockSlots">
              {slots.map((slot) => (
                <div
                  key={slot.key}
                  className={["referenceDockSlot", slot.asset ? "active" : "", dragTarget === slot.key ? "dragOver" : ""].filter(Boolean).join(" ")}
                  title={slot.hint}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    if (dragTarget !== slot.key) setDragTarget(slot.key);
                  }}
                  onDragLeave={(event) => {
                    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                    setDragTarget((current) => (current === slot.key ? "" : current));
                  }}
                  onDrop={(event) => handleDrop(event, slot)}
                >
                  <div className="referenceDockSlotTop">
                    <span>
                      <strong>{slot.label}</strong>
                    </span>
                    <code>{slot.token}</code>
                  </div>
                  <div className={slot.asset ? "referenceDockThumbs" : "referenceDockThumbs empty"}>
                    {slot.asset ? (
                      <div className="referenceDockAssetThumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={assetImageSource(slot.asset)} alt={slot.asset.title || slot.asset.id} />
                        <button type="button" title={`Clear ${slot.label.toLowerCase()}`} onClick={slot.onClear}>
                          <X size={11} />
                        </button>
                        <em>{slot.hint}</em>
                      </div>
                    ) : (
                      <span className="referenceDockEmpty">
                        <ImagePlus size={14} />
                        {slot.hint}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="referenceDockNote">Draw regions on the image first; each one becomes a drop target here.</p>
          )}
        </div>
      )}
    </section>
  );
}
