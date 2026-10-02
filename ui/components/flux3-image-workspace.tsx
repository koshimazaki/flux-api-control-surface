import { ImagePlus, WandSparkles, X } from "lucide-react";
import { useState, type ComponentProps, type DragEvent as ReactDragEvent } from "react";
import { Flux3ImageControls } from "@/components/flux3-image-controls";
import { Flux3ImageDock } from "@/components/flux3-image-dock";
import { Flux3ImageReferenceSlots } from "@/components/flux3-image-references";
import { RegionLayer, useBoxKeys } from "@/components/flux3-image-regions";
import { Flux3ImageResult } from "@/components/flux3-image-result";
import { MaskCanvas, type CanvasShape } from "@/components/mask-canvas";
import { CanvasSurface } from "@/components/ui/canvas-surface";
import { IconButton } from "@/components/ui/icon-button";
import type { JobQueue } from "@/components/ui/job-queue";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import type { Size } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { flux3ImageModeTitles, flux3ImageRequestFor, flux3ImageRunTitle } from "@/lib/dashboard/flux3-image-request";
import { useFlux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import type { Flux3ImageRunInput, Flux3ImageRunView } from "@/lib/dashboard/use-flux3-image-run";
import {
  FLUX3_IMAGE_MAX_REFERENCES,
  estimateFlux3ImageUsd,
  flux3ImageRequestBlocker,
  placeReferenceIds,
  removeReference,
  type Flux3ImageMode,
  type Flux3ImageRegion,
  type Flux3ImageSettings
} from "@/lib/flux3-image";
import { layoutFrameImage, layoutFrameSize, rescaleBoxes } from "@/lib/flux3-image-boxes";
import { boxFromPoints } from "@/lib/flux3-image-regions";
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
  onClearSource: () => void;
  onSourceDropPayload: (payload: string) => void;
  onSourceFiles: (files: File[]) => void;
  /** Runs the request through the queue-backed FLUX 3 Image route. */
  onRun: (input: Flux3ImageRunInput) => Promise<unknown>;
  isRunning: boolean;
  /** The runs being followed and the latest finished image, shown over the stage. */
  run: Flux3ImageRunView;
  /** The server queue: FLUX 3 Image jobs line up in it like any other. */
  queue: ComponentProps<typeof JobQueue>;
  /** Closes the layer over the stage; running jobs carry on in the queue. */
  onDismissResult: () => void;
  onOpenResult: (asset: AssetRecord) => void;
  /** Loads a result as the source of the next edit. */
  onEditResult: (asset: AssetRecord) => void;
};

const newBox = (id: string, box: { x: number; y: number; width: number; height: number }): Flux3ImageRegion => ({
  id,
  ...box,
  action: "change",
  prompt: "",
  referenceId: null
});

/**
 * FLUX 3 Image on its published API. Text to image, optionally laid out with
 * boxes on a frame of the chosen aspect ratio; image to image from up to ten
 * references; a whole-image edit; and edits with boxes, each changing,
 * keeping, moving or removing what is there. Boxes are BFL's placement rows,
 * not masks: they convert from pixels to its 0–1000 grid exactly.
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
  const request = flux3ImageRequestFor(draft, source, sourceOf);
  const blocker = flux3ImageRequestBlocker(request);
  const estimate = estimateFlux3ImageUsd(request);
  const layoutFrame = layoutFrameSize(draft.settings.aspectRatio);
  const layoutMode = draft.mode === "t2i" && draft.layoutEnabled;
  const boxKey = layoutMode ? "layoutRegions" : "regions";

  /** Choosing a mode is work on the stage, so a result or waiting field over it steps aside. */
  function changeMode(mode: Flux3ImageMode) {
    update({ mode });
    props.onDismissResult();
  }

  function updateRegion(region: Flux3ImageRegion) {
    setDraft((current) => ({ ...current, [boxKey]: current[boxKey].map((item) => (item.id === region.id ? region : item)) }));
  }

  function removeRegion(id: string) {
    setDraft((current) => ({ ...current, [boxKey]: current[boxKey].filter((region) => region.id !== id) }));
    if (activeRegionId === id) setActiveRegionId(null);
  }
  useBoxKeys({
    activeId: activeRegionId,
    enabled: draft.mode === "precise" || layoutMode,
    regions: draft[boxKey],
    frame: layoutMode ? layoutFrame : draft.regionFrame,
    onChange: updateRegion,
    onRemove: removeRegion
  });

  /** Every drag on the image makes a box; in Edit, the first box turns the edit into a precise one. */
  function handleShape(shape: CanvasShape, size: Size) {
    const box = boxFromPoints(shape.points, size);
    if (!box) {
      // A click on the image rather than a drag closes the open box card.
      setActiveRegionId(null);
      return;
    }
    const id = `box-${Date.now().toString(36)}`;
    if (layoutMode) {
      setDraft((current) => ({ ...current, layoutRegions: [...current.layoutRegions, newBox(id, box)] }));
    } else {
      setDraft((current) => ({
        ...current,
        mode: "precise",
        regions: [...current.regions, newBox(id, box)],
        regionSourceId: sourceAsset?.id ?? null,
        regionFrame: size,
        prompts: { ...current.prompts, precise: current.prompts.precise || (current.mode === "edit" ? current.prompts.edit : "") }
      }));
    }
    setActiveRegionId(id);
    // The description is typed straight into the new box.
    window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-region-id="${id}"] .regionCard textarea`)?.focus());
  }

  function changeSettings(settings: Flux3ImageSettings) {
    // Layout boxes stay where they were in the frame when its aspect ratio changes.
    const next = layoutFrameSize(settings.aspectRatio);
    update({ settings, layoutRegions: rescaleBoxes(draft.layoutRegions, layoutFrame, next) });
  }

  function submit() {
    if (blocker) {
      setNotice(blocker);
      return;
    }
    const boxReferences = draft.mode === "precise" ? draft.regions.map((region) => assetById(region.referenceId)) : [];
    const inputs =
      draft.mode === "i2i"
        ? referenceAssets
        : draft.mode === "edit" || draft.mode === "precise"
          ? [sourceAsset, ...boxReferences]
          : [];
    const assets = inputs.filter((asset, index, all): asset is AssetRecord => !!asset && all.indexOf(asset) === index);
    setNotice("");
    void props.onRun({
      request,
      title: flux3ImageRunTitle(draft),
      sourceAssetIds: assets.map((asset) => asset.id),
      referenceMeta: assets.map((asset) => ({ id: asset.id, name: asset.title || asset.id, value: assetImageSource(asset), assetId: asset.id }))
    });
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

  /** Removes a reference; later ones move up, and the prompt's image numbers follow them. */
  function removeReferenceAt(index: number) {
    const result = removeReference(draft.references, index, draft.prompts.i2i);
    setDraft((current) => ({ ...current, references: result.references, prompts: { ...current.prompts, i2i: result.prompt } }));
    const moved = result.moved === 1 ? `Image ${index + 2} is now image ${index + 1}` : `Images ${index + 2}–${index + result.moved + 1} moved up one`;
    if (!result.moved) setNotice("");
    else if (result.namesRemoved) setNotice(`${moved}. The prompt still names image ${index + 1}, which you removed; check its image numbers.`);
    else if (result.renumbered) setNotice(`${moved}, and the prompt's image numbers were updated to match.`);
    else setNotice(`${moved}.`);
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
      // A reference only means something on a change: the element comes from that image.
      setDraft((current) => ({
        ...current,
        regions: current.regions.map((region) =>
          region.id === id ? { ...region, action: "change", target: null, referenceId: asset.id } : region
        )
      }));
      setNotice("");
    } catch {
      setNotice("That image could not be added as the box's reference.");
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
    if (layoutMode) return;
    // A new source is work on the stage: whatever covers it steps aside.
    props.onDismissResult();
    if (payload) props.onSourceDropPayload(payload);
    else props.onSourceFiles(files);
  }

  const regionCallbacks = {
    variant: layoutMode ? ("layout" as const) : ("edit" as const),
    resolution: draft.settings.resolution,
    activeId: activeRegionId,
    referenceFor: (region: Flux3ImageRegion) => assetById(region.referenceId),
    onSelect: setActiveRegionId,
    onDeselect: () => setActiveRegionId(null),
    onChange: updateRegion,
    onRemove: removeRegion,
    onReference: (id: string, payload: string, files: File[]) => void setRegionReference(id, payload, files)
  };

  function boxCanvas(key: string, imageSrc: string, regions: Flux3ImageRegion[]) {
    return (
      <MaskCanvas
        key={key}
        imageSrc={imageSrc}
        brushSize={0}
        mask=""
        onMaskChange={() => undefined}
        tool="box"
        onShape={handleShape}
        renderOverlay={(size) => <RegionLayer regions={regions} size={size} {...regionCallbacks} />}
      />
    );
  }

  function renderStage() {
    if (layoutMode) return boxCanvas(`layout-${draft.settings.aspectRatio}`, layoutFrameImage(layoutFrame), draft.layoutRegions);
    if (draft.mode === "t2i") {
      return (
        <div className="imageToolEmpty">
          <WandSparkles size={34} />
          <strong>Your FLUX 3 Image result will appear here</strong>
          <span>Text to image needs no source. Turn on layout to place elements with boxes.</span>
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
            onRemove={removeReferenceAt}
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
    return boxCanvas(`${sourceAsset.id}-boxes`, source, draft.mode === "precise" ? draft.regions : []);
  }

  const boxes = layoutMode ? draft.layoutRegions : draft.regions;
  const referenceCount = referenceAssets.filter(Boolean).length;
  const selectionLabel =
    draft.mode === "i2i"
      ? `${referenceCount}/${FLUX3_IMAGE_MAX_REFERENCES} references`
      : draft.mode === "edit"
        ? "whole image"
        : draft.mode === "precise" || layoutMode
          ? `${boxes.length} box${boxes.length === 1 ? "" : "es"}`
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
          <PanelHeader title="FLUX 3 Image" subtitle={layoutMode ? "Text to image with layout" : flux3ImageModeTitles[draft.mode]}>
            <div className="workspaceHeaderActions">
              {sourceAsset && (draft.mode === "edit" || draft.mode === "precise") && (
                <IconButton
                  onClick={() => {
                    props.onDismissResult();
                    props.onClearSource();
                  }}
                  title="Clear source"
                >
                  <X size={14} />
                </IconButton>
              )}
            </div>
          </PanelHeader>
          <CanvasSurface className={props.isRunning ? "imageToolCanvas edgeSweep" : "imageToolCanvas"} variant="tool">
            {renderStage()}
            {props.run.watching && (
              <Flux3ImageResult
                running={props.isRunning}
                run={props.run}
                onOpen={props.onOpenResult}
                onEdit={props.onEditResult}
                onDismiss={props.onDismissResult}
              />
            )}
          </CanvasSurface>
          <div className="imageToolMeta">
            <MetaBox label="Mode" value={flux3ImageModeTitles[draft.mode]} />
            <MetaBox
              label="Source"
              value={draft.mode === "t2i" || draft.mode === "i2i" ? "not needed" : sourceAsset?.title || sourceAsset?.id || "None"}
            />
            <MetaBox label="Selection" value={selectionLabel} />
          </div>
        </section>
      </div>

      <Flux3ImageControls
        draft={draft}
        layoutMode={layoutMode}
        layoutFrame={layoutFrame}
        regionCallbacks={regionCallbacks}
        estimate={estimate}
        blocker={blocker}
        notice={notice}
        isRunning={props.isRunning}
        queue={props.queue}
        onModeChange={changeMode}
        onDraftChange={update}
        onSettingsChange={changeSettings}
        onSubmit={submit}
      />

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
        onClearSlot={removeReferenceAt}
      />
    </>
  );
}
