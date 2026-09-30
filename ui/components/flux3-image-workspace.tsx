import { Brush, ImagePlus, Lasso, MessageSquareText, SquareDashed, Target, WandSparkles, X } from "lucide-react";
import { useState, type DragEvent as ReactDragEvent } from "react";
import { MaskCanvas } from "@/components/mask-canvas";
import { RegionBoxLayer, RegionBoxList } from "@/components/flux3-image-regions";
import { CanvasSurface } from "@/components/ui/canvas-surface";
import { IconButton } from "@/components/ui/icon-button";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import { SelectorGroup, SelectorOption } from "@/components/ui/selector-group";
import type { Size } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { useFlux3ImageDraft, type Flux3ImageDraft } from "@/lib/dashboard/use-flux3-image-draft";
import {
  FLUX3_IMAGE_DEFAULT_FUZZ,
  boxFromDrag,
  estimateFlux3ImageUsd,
  flux3ImageRequestBlocker,
  type Flux3ImageBox,
  type Flux3ImageMode,
  type Flux3ImageRequest,
  type ImagePoint
} from "@/lib/flux3-image";
import { dragPayloadFromTransfer, imageFilesFromTransfer, isSourceDrag } from "@/lib/source-drop";
import type { AssetRecord } from "@/lib/types";

type Flux3ImageWorkspaceProps = {
  /** The shared tool source, the same image Erase, Outpaint and Deblur use. */
  sourceAsset: AssetRecord | null;
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
  { id: "edit", label: "Edit", detail: "Whole image", icon: WandSparkles },
  { id: "precise", label: "Precise", detail: "Boxes or pixels", icon: Target }
];

const modeTitles: Record<Flux3ImageMode, string> = {
  t2i: "Text to image",
  edit: "Image edit",
  precise: "Precise edit"
};

function requestFor(draft: Flux3ImageDraft, source: string | undefined, mask: string): Flux3ImageRequest {
  if (draft.mode === "t2i") return { mode: "t2i", prompt: draft.prompts.t2i };
  if (draft.mode === "edit") return { mode: "edit", source, prompt: draft.prompts.edit };
  if (draft.selection === "pixels") {
    return { mode: "precise", source, selection: "pixels", mask: mask || undefined, prompt: draft.prompts.pixels };
  }
  return { mode: "precise", source, selection: "boxes", boxes: draft.boxes };
}

/**
 * FLUX 3 Image, prepared ahead of its API: text to image, whole-image edits,
 * and precise edits confined to bounding boxes (with a fuzz radius) or to
 * painted pixels. Precise edits reuse the Erase mask canvas and its source
 * image. Nothing is submitted until the endpoint is published.
 */
export function Flux3ImageWorkspace(props: Flux3ImageWorkspaceProps) {
  const { sourceAsset } = props;
  const { draft, update } = useFlux3ImageDraft(sourceAsset?.id ?? null);
  const [activeBoxId, setActiveBoxId] = useState<string | null>(null);
  const [isDropActive, setIsDropActive] = useState(false);
  const [notice, setNotice] = useState("");
  const source = sourceAsset ? assetImageSource(sourceAsset) : undefined;
  const request = requestFor(draft, source, props.mask);
  const blocker = flux3ImageRequestBlocker(request);
  const estimate = estimateFlux3ImageUsd(request);
  const promptKey = draft.mode === "t2i" ? "t2i" : draft.mode === "edit" ? "edit" : "pixels";

  function setPrompt(value: string) {
    update({ prompts: { ...draft.prompts, [promptKey]: value } });
  }

  function changeBox(id: string, patch: Partial<Flux3ImageBox>) {
    update({ boxes: draft.boxes.map((box) => (box.id === id ? { ...box, ...patch } : box)) });
  }

  function removeBox(id: string) {
    update({ boxes: draft.boxes.filter((box) => box.id !== id) });
    if (activeBoxId === id) setActiveBoxId(null);
  }

  function addBox(start: ImagePoint, end: ImagePoint, size: Size) {
    const rect = boxFromDrag(start, end, size);
    if (!rect) return;
    const box = { id: `box-${Date.now().toString(36)}`, ...rect, fuzz: FLUX3_IMAGE_DEFAULT_FUZZ, prompt: "" };
    update({ boxes: [...draft.boxes, box], boxSourceId: sourceAsset?.id ?? null });
    setActiveBoxId(box.id);
    // The edit is typed straight into the new box.
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>(`[data-box-id="${box.id}"] input`)?.focus()
    );
  }

  function submit() {
    // Unreachable while the blocker holds; the server route arrives with the API schema.
    setNotice(blocker || "The FLUX 3 Image route is added together with the published API schema.");
  }

  function handleDrop(event: ReactDragEvent) {
    const payload = dragPayloadFromTransfer(event);
    const files = imageFilesFromTransfer(event);
    setIsDropActive(false);
    if (!payload && !files.length) return;
    event.preventDefault();
    if (payload) props.onSourceDropPayload(payload);
    else props.onSourceFiles(files);
  }

  function renderStage() {
    if (draft.mode === "t2i") {
      return (
        <div className="imageToolEmpty">
          <WandSparkles size={34} />
          <strong>Your FLUX 3 Image result will appear here</strong>
          <span>Text to image needs no source. Edit and Precise use the image loaded here or in Erase.</span>
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
        <div className="flux3ImageSource">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt={sourceAsset.title || sourceAsset.id} />
          <small className="maskPaintHint">whole-image edit · describe the change in the prompt</small>
        </div>
      );
    }
    const boxes = draft.selection === "boxes";
    return (
      <MaskCanvas
        key={`${sourceAsset.id}-${draft.selection}`}
        imageSrc={source}
        brushSize={props.brushSize}
        mask={boxes ? "" : props.mask}
        onMaskChange={props.onMaskChange}
        tool={boxes ? "box" : draft.pixelTool}
        hardEdges
        onBoxDraw={addBox}
        renderOverlay={
          boxes
            ? (size) => (
                <RegionBoxLayer
                  boxes={draft.boxes}
                  size={size}
                  activeId={activeBoxId}
                  onSelect={setActiveBoxId}
                  onChange={changeBox}
                  onRemove={removeBox}
                />
              )
            : undefined
        }
      />
    );
  }

  const selectionLabel =
    draft.mode !== "precise"
      ? draft.mode === "edit"
        ? "whole image"
        : "none"
      : draft.selection === "boxes"
        ? `${draft.boxes.length} box${draft.boxes.length === 1 ? "" : "es"}`
        : props.mask
          ? "pixels painted"
          : "no pixels";

  return (
    <section className="flux3ImageWorkspace">
      <div
        className={`flux3PreviewPanel panel flux3ImageStage${isDropActive ? " dropReady" : ""}`}
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
            {sourceAsset && draft.mode !== "t2i" && (
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
          <MetaBox label="Source" value={draft.mode === "t2i" ? "not needed" : sourceAsset?.title || sourceAsset?.id || "None"} />
          <MetaBox label="Selection" value={selectionLabel} />
        </div>
      </div>

      <aside className="flux3Controls panel controls flux3ImageControls">
        <PanelHeader title="Create image" subtitle="Text, edit, or a precise edit">
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

        {draft.mode === "precise" && (
          <SelectorGroup variant="segmented" className="flux3ImageSelection" aria-label="Precise selection">
            <SelectorOption variant="segmented" selected={draft.selection === "boxes"} onClick={() => update({ selection: "boxes" })}>
              <SquareDashed size={14} />
              Boxes
            </SelectorOption>
            <SelectorOption variant="segmented" selected={draft.selection === "pixels"} onClick={() => update({ selection: "pixels" })}>
              <Brush size={14} />
              Pixels
            </SelectorOption>
          </SelectorGroup>
        )}

        {draft.mode === "precise" && draft.selection === "boxes" ? (
          <RegionBoxList
            boxes={draft.boxes}
            activeId={activeBoxId}
            onSelect={setActiveBoxId}
            onChange={changeBox}
            onRemove={removeBox}
          />
        ) : (
          <>
            {draft.mode === "precise" && (
              <>
                <div className="flux3ImagePixelTools">
                  <button
                    type="button"
                    className={draft.pixelTool === "brush" ? "active" : ""}
                    aria-pressed={draft.pixelTool === "brush"}
                    onClick={() => update({ pixelTool: "brush" })}
                  >
                    <Brush size={14} />
                    Brush
                  </button>
                  <button
                    type="button"
                    className={draft.pixelTool === "lasso" ? "active" : ""}
                    aria-pressed={draft.pixelTool === "lasso"}
                    onClick={() => update({ pixelTool: "lasso" })}
                  >
                    <Lasso size={14} />
                    Lasso
                  </button>
                </div>
                {draft.pixelTool === "brush" && (
                  <label>
                    Brush size · {props.brushSize}px
                    <input
                      type="range"
                      min={4}
                      max={160}
                      value={props.brushSize}
                      onChange={(event) => props.onBrushSizeChange(Number(event.target.value))}
                    />
                  </label>
                )}
                <div className="maskStatusRow">
                  <span>{props.mask ? "Pixels selected · hard edges" : "Paint the exact pixels to change"}</span>
                  <button type="button" onClick={() => props.onMaskChange("")} disabled={!props.mask}>
                    Clear mask
                  </button>
                </div>
              </>
            )}
            <label>
              {draft.mode === "t2i" ? "Image prompt" : draft.mode === "edit" ? "Edit instruction" : "Edit for the painted pixels"}
              <textarea
                className="toolPrompt"
                rows={5}
                value={draft.prompts[promptKey]}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  draft.mode === "t2i" ? "Describe the image…" : "Describe what should change, and what should stay…"
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
          {draft.mode === "t2i" ? "Generate image" : "Apply edit"}
        </RunButton>
        {blocker && <p className="flux3Blocker">{blocker}</p>}
      </aside>
    </section>
  );
}
