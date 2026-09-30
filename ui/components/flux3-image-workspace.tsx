import { Brush, Eraser, Images, ImagePlus, Lasso, MessageSquareText, SquareDashed, Target, WandSparkles, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import { Flux3ImageDock } from "@/components/flux3-image-dock";
import { Flux3ImageReferenceSlots } from "@/components/flux3-image-references";
import { RegionLayer, RegionList } from "@/components/flux3-image-regions";
import { BrushSizeField, ToolPicker, type ToolOption } from "@/components/flux3-image-tools";
import { MaskCanvas, type CanvasShape } from "@/components/mask-canvas";
import { CanvasSurface } from "@/components/ui/canvas-surface";
import { IconButton } from "@/components/ui/icon-button";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import type { Size } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { useFlux3ImageDraft, type Flux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import {
  FLUX3_IMAGE_DEFAULT_FUZZ,
  FLUX3_IMAGE_MAX_REFERENCES,
  estimateFlux3ImageUsd,
  flux3ImageRequestBlocker,
  placeReferenceIds,
  type Flux3ImageMode,
  type Flux3ImageRegion,
  type Flux3ImageRequest
} from "@/lib/flux3-image";
import { addPathToRegion, regionFromShape } from "@/lib/flux3-image-regions";
import { parseReferenceDragPayload } from "@/lib/reference-drag";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

type Flux3ImageWorkspaceProps = {
  /** The shared tool source, the same image Erase, Outpaint and Deblur use. */
  sourceAsset: AssetRecord | null;
  /** The asset library, for resolving references by asset id. */
  assets: AssetRecord[];
  /** Imports dropped or chosen files as library assets so references persist by id. */
  onImportFiles: (files: File[]) => Promise<AssetRecord[]>;
  /** The shared tool mask: Edit paints its inpaint area here, as Erase does. */
  mask: string;
  onMaskChange: (mask: string) => void;
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  onClearSource: () => void;
  onSourceDropPayload: (payload: string) => void;
  onSourceFiles: (files: File[]) => void;
};

const modeOptions: Array<{ id: Flux3ImageMode; label: string; detail: string; icon: typeof WandSparkles }> = [
  { id: "t2i", label: "Text", detail: "Prompt → image", icon: MessageSquareText },
  { id: "i2i", label: "Image", detail: `1–${FLUX3_IMAGE_MAX_REFERENCES} references`, icon: Images },
  { id: "edit", label: "Edit", detail: "Whole image or inpaint", icon: WandSparkles },
  { id: "precise", label: "Precise", detail: "Regions + references", icon: Target }
];

const modeTitles: Record<Flux3ImageMode, string> = {
  t2i: "Text to image",
  i2i: "Image to image",
  edit: "Image edit",
  precise: "Precise edit"
};

const editTools: ToolOption<Flux3ImageDraft["editTool"]>[] = [
  { id: "brush", label: "Brush", icon: Brush },
  { id: "lasso", label: "Lasso", icon: Lasso },
  { id: "eraser", label: "Eraser", icon: Eraser }
];

const regionTools: ToolOption<Flux3ImageDraft["regionTool"]>[] = [
  { id: "box", label: "Box", icon: SquareDashed },
  { id: "brush", label: "Brush", icon: Brush },
  { id: "lasso", label: "Lasso", icon: Lasso }
];

function requestFor(
  draft: Flux3ImageDraft,
  source: string | undefined,
  mask: string,
  sourceOf: (id: string | null | undefined) => string | undefined
): Flux3ImageRequest {
  if (draft.mode === "t2i") return { mode: "t2i", prompt: draft.prompts.t2i };
  if (draft.mode === "i2i") {
    const references = draft.references.map(sourceOf).filter((item): item is string => !!item);
    return { mode: "i2i", prompt: draft.prompts.i2i, references };
  }
  if (draft.mode === "edit") return { mode: "edit", source, prompt: draft.prompts.edit, mask: mask || undefined };
  const regions = draft.regions.map(({ referenceId, ...region }) => ({ ...region, reference: sourceOf(referenceId) }));
  return { mode: "precise", source, regions };
}

/**
 * FLUX 3 Image, prepared ahead of its API: text to image, image to image from
 * up to four references, edits of the whole image or an inpainted area, and
 * precise edits made of regions (box, brush or lasso), each with its own
 * edit, fuzz radius and reference image. Edit and Precise reuse the Erase
 * canvas and its source image. Nothing is submitted until the endpoint exists.
 */
export function Flux3ImageWorkspace(props: Flux3ImageWorkspaceProps) {
  const { sourceAsset } = props;
  const { draft, update, setDraft } = useFlux3ImageDraft(sourceAsset?.id ?? null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [notice, setNotice] = useState("");
  const source = sourceAsset ? assetImageSource(sourceAsset) : undefined;
  const assetById = (id: string | null | undefined) => (id ? props.assets.find((asset) => asset.id === id) ?? null : null);
  const sourceOf = (id: string | null | undefined) => {
    const asset = assetById(id);
    return asset ? assetImageSource(asset) : undefined;
  };
  const referenceAssets = draft.references.map(assetById);
  const request = requestFor(draft, source, props.mask, sourceOf);
  const blocker = flux3ImageRequestBlocker(request);
  const estimate = estimateFlux3ImageUsd(request);
  const promptKey = draft.mode === "precise" ? null : draft.mode;

  function updateRegion(region: Flux3ImageRegion) {
    setDraft((current) => ({ ...current, regions: current.regions.map((item) => (item.id === region.id ? region : item)) }));
  }

  function removeRegion(id: string) {
    setDraft((current) => ({ ...current, regions: current.regions.filter((region) => region.id !== id) }));
    if (activeRegionId === id) setActiveRegionId(null);
  }

  /** Every box, brush stroke or lasso makes a region; with Shift, it adds to the selected one. */
  function handleShape(shape: CanvasShape, size: Size) {
    const kind = shape.tool === "box" ? "box" : shape.tool === "lasso" ? "lasso" : "paint";
    const active = draft.regions.find((region) => region.id === activeRegionId);
    if (shape.additive && active && active.kind === kind && kind !== "box") {
      updateRegion(addPathToRegion(active, shape.points, size));
      return;
    }
    const drawn = regionFromShape(kind, [shape.points], size, shape.brush);
    if (!drawn) {
      // A click on the image rather than a drag closes the open region card.
      setActiveRegionId(null);
      return;
    }
    const id = `region-${Date.now().toString(36)}`;
    const region: Flux3ImageRegion = { id, ...drawn, fuzz: FLUX3_IMAGE_DEFAULT_FUZZ, prompt: "", referenceId: null };
    setDraft((current) => ({ ...current, regions: [...current.regions, region], regionSourceId: sourceAsset?.id ?? null }));
    setActiveRegionId(id);
    // The edit is typed straight into the new region.
    window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-region-id="${id}"] .regionCard textarea`)?.focus());
  }

  function submit() {
    // Unreachable while the blocker holds; the server route arrives with the API schema.
    setNotice(blocker || "The FLUX 3 Image route is added together with the published API schema.");
  }

  /** Resolves a drop or file choice to library assets: known ids directly, the rest imported. */
  async function referenceAssetsFrom(payload: string, files: File[]) {
    if (!payload) return props.onImportFiles(files);
    const dragged = parseReferenceDragPayload(payload);
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : dragged?.assetId;
    const known = assetById(assetId);
    if (known) return [known];
    if (!dragged?.value) return [];
    const blob = await (await fetch(dragged.value)).blob();
    return props.onImportFiles([new File([blob], `${dragged.name || "reference"}.png`, { type: blob.type || "image/png" })]);
  }

  async function addReferences(index: number, payload: string, files: File[]) {
    try {
      const added = await referenceAssetsFrom(payload, files.slice(0, FLUX3_IMAGE_MAX_REFERENCES));
      if (!added.length) return;
      setDraft((current) => ({
        ...current,
        references: placeReferenceIds(current.references, added.map((asset) => asset.id), index)
      }));
      setNotice("");
    } catch {
      setNotice("That image could not be added as a reference.");
    }
  }

  async function setRegionReference(id: string, payload: string, files: File[]) {
    try {
      const [asset] = await referenceAssetsFrom(payload, files.slice(0, 1));
      if (!asset) return;
      setDraft((current) => ({
        ...current,
        regions: current.regions.map((region) => (region.id === id ? { ...region, referenceId: asset.id } : region))
      }));
      setNotice("");
    } catch {
      setNotice("That image could not be added as the region's reference.");
    }
  }

  function handleDrop(event: ReactDragEvent) {
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    setIsDropActive(false);
    if (!payload && !files.length) return;
    event.preventDefault();
    if (draft.mode === "i2i") {
      // Outside a slot, a drop goes to the first empty reference.
      const free = draft.references.findIndex((id) => !id);
      void addReferences(free === -1 ? draft.references.length - 1 : free, payload, files);
      return;
    }
    if (payload) props.onSourceDropPayload(payload);
    else props.onSourceFiles(files);
  }

  const regionCallbacks = {
    activeId: activeRegionId,
    referenceFor: (region: Flux3ImageRegion) => assetById(region.referenceId),
    onSelect: setActiveRegionId,
    onDeselect: () => setActiveRegionId(null),
    onChange: updateRegion,
    onRemove: removeRegion,
    onReference: (id: string, payload: string, files: File[]) => void setRegionReference(id, payload, files)
  };

  function renderStage() {
    if (draft.mode === "t2i") {
      return (
        <div className="imageToolEmpty">
          <WandSparkles size={34} />
          <strong>Your FLUX 3 Image result will appear here</strong>
          <span>
            Text to image needs no source. Image uses up to {FLUX3_IMAGE_MAX_REFERENCES} references; Edit and Precise use
            the image loaded here or in Erase.
          </span>
        </div>
      );
    }
    if (draft.mode === "i2i") {
      const sourceIsReference = sourceAsset ? draft.references.includes(sourceAsset.id) : true;
      return (
        <div className="flux3ReferenceStage">
          <Flux3ImageReferenceSlots
            slots={referenceAssets}
            onAdd={(index, payload, files) => void addReferences(index, payload, files)}
            onRemove={(index) => update({ references: draft.references.map((id, slot) => (slot === index ? null : id)) })}
          />
          {sourceAsset && !sourceIsReference && (
            <button
              type="button"
              className="flux3ReferenceUseSource"
              onClick={() => void addReferences(Math.max(0, draft.references.findIndex((id) => !id)), `asset:${sourceAsset.id}`, [])}
            >
              <ImagePlus size={14} />
              Add the loaded source ({sourceAsset.title || sourceAsset.id})
            </button>
          )}
        </div>
      );
    }
    if (!sourceAsset || !source) {
      return (
        <div className="imageToolEmpty">
          <ImagePlus size={34} />
          <strong>No source image</strong>
          <span>Drop an image or drag an asset here. It is shared with Erase, Outpaint and Deblur.</span>
        </div>
      );
    }
    if (draft.mode === "edit") {
      return (
        <MaskCanvas
          key={`${sourceAsset.id}-edit`}
          imageSrc={source}
          brushSize={props.brushSize}
          mask={props.mask}
          onMaskChange={props.onMaskChange}
          tool={draft.editTool}
        />
      );
    }
    return (
      <MaskCanvas
        key={`${sourceAsset.id}-regions`}
        imageSrc={source}
        brushSize={props.brushSize}
        mask=""
        onMaskChange={props.onMaskChange}
        tool={draft.regionTool}
        onShape={handleShape}
        renderOverlay={(size) => <RegionLayer regions={draft.regions} size={size} {...regionCallbacks} />}
      />
    );
  }

  const referenceCount = referenceAssets.filter(Boolean).length;
  const selectionLabel =
    draft.mode === "i2i"
      ? `${referenceCount}/${FLUX3_IMAGE_MAX_REFERENCES} references`
      : draft.mode === "edit"
        ? props.mask
          ? "painted area"
          : "whole image"
        : draft.mode === "precise"
          ? `${draft.regions.length} region${draft.regions.length === 1 ? "" : "s"}`
          : "none";

  // Same grid cells as Erase and the other image tools: the stage in the main
  // cell, the controls in the right-hand run column.
  return (
    <>
      <div className="workspaceMain">
        <section
          className={`panel editor imageToolWorkspace flux3ImageStage${isDropActive ? " dropReady" : ""}`}
          onDragEnter={(event) => {
            if (isSourceDrag(event)) setIsDropActive(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDropActive(false);
          }}
          onDragOver={(event) => {
            if (!isSourceDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleDrop}
        >
          <PanelHeader title="FLUX 3 Image" subtitle={modeTitles[draft.mode]}>
            <div className="workspaceHeaderActions">
              <span className="flux3ImagePending">API pending</span>
              {sourceAsset && (draft.mode === "edit" || draft.mode === "precise") && (
                <IconButton onClick={props.onClearSource} title="Clear source">
                  <X size={14} />
                </IconButton>
              )}
            </div>
          </PanelHeader>
          <CanvasSurface className="imageToolCanvas" variant="tool">
            {renderStage()}
          </CanvasSurface>
          <div className="imageToolMeta">
            <MetaBox label="Mode" value={modeTitles[draft.mode]} />
            <MetaBox
              label="Source"
              value={draft.mode === "t2i" || draft.mode === "i2i" ? "not needed" : sourceAsset?.title || sourceAsset?.id || "None"}
            />
            <MetaBox label="Selection" value={selectionLabel} />
          </div>
        </section>
      </div>

      <aside className="panel controls toolControls flux3ImageControls">
        <PanelHeader title="Create image" subtitle="Text, references, edit, regions">
          <WandSparkles size={18} aria-label="FLUX 3 Image" />
        </PanelHeader>
        <div className="flux3ModePicker">
          {modeOptions.map(({ id, label, detail, icon: Icon }) => (
            <button type="button" className={draft.mode === id ? "active" : ""} key={id} onClick={() => update({ mode: id })}>
              <Icon size={16} />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
            </button>
          ))}
        </div>

        {draft.mode === "edit" && (
          <>
            <ToolPicker label="Inpaint tools" options={editTools} value={draft.editTool} onChange={(editTool) => update({ editTool })} />
            {draft.editTool !== "lasso" && <BrushSizeField value={props.brushSize} onChange={props.onBrushSizeChange} />}
            <div className="maskStatusRow">
              <span>{props.mask ? "Inpaint area painted" : "No mask: the whole image is edited"}</span>
              <button type="button" onClick={() => props.onMaskChange("")} disabled={!props.mask}>
                Clear mask
              </button>
            </div>
          </>
        )}

        {draft.mode === "precise" && (
          <>
            <ToolPicker label="Region tools" options={regionTools} value={draft.regionTool} onChange={(regionTool) => update({ regionTool })} />
            {draft.regionTool === "brush" && <BrushSizeField value={props.brushSize} onChange={props.onBrushSizeChange} />}
            <p className="toolStubNote">
              Each box, stroke or lasso makes a region. Hold Shift to add a stroke or lasso to the selected region; drag
              its edges to resize it and its number to move it.
            </p>
            <RegionList regions={draft.regions} {...regionCallbacks} />
          </>
        )}

        {promptKey && (
          <>
            {draft.mode === "i2i" && (
              <p className="toolStubNote">
                Drop up to {FLUX3_IMAGE_MAX_REFERENCES} references on the numbered slots and name them in the prompt as
                image 1, image 2 and so on.
              </p>
            )}
            <label>
              {draft.mode === "t2i" ? "Image prompt" : draft.mode === "i2i" ? "Prompt using the references" : "Edit instruction"}
              <textarea
                className="toolPrompt"
                rows={5}
                value={draft.prompts[promptKey]}
                onChange={(event) => update({ prompts: { ...draft.prompts, [promptKey]: event.target.value } })}
                placeholder={
                  draft.mode === "t2i"
                    ? "Describe the image…"
                    : draft.mode === "i2i"
                      ? "The character from image 1 in the jacket from image 2, lit like image 3…"
                      : "Describe what should change in the painted area, or the whole image…"
                }
              />
            </label>
          </>
        )}

        <div className="flux3CostBox">
          <div>
            <span>Model</span>
            <strong>FLUX 3 Image</strong>
          </div>
          <div>
            <span>Estimate</span>
            <strong>{estimate === null ? "After launch" : `$${estimate.toFixed(2)}`}</strong>
          </div>
          <small>Settings and pricing are added once the API documents them.</small>
        </div>
        {notice && <p className="flux3Warning">{notice}</p>}
        <RunButton isRunning={false} onClick={submit} disabled={Boolean(blocker)} icon={WandSparkles}>
          {draft.mode === "t2i" || draft.mode === "i2i" ? "Generate image" : "Apply edit"}
        </RunButton>
        {blocker && <p className="flux3Blocker">{blocker}</p>}
      </aside>

      <Flux3ImageDock
        mode={draft.mode}
        regions={draft.regions}
        referenceFor={regionCallbacks.referenceFor}
        onRegionReference={regionCallbacks.onReference}
        onClearRegionReference={(id) =>
          setDraft((current) => ({
            ...current,
            regions: current.regions.map((region) => (region.id === id ? { ...region, referenceId: null } : region))
          }))
        }
        referenceSlots={referenceAssets}
        onSlotReference={(index, payload, files) => void addReferences(index, payload, files)}
        onClearSlot={(index) => update({ references: draft.references.map((id, slot) => (slot === index ? null : id)) })}
      />
    </>
  );
}
