import { ImagePlus, X } from "lucide-react";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";

type ImageToolMode = Exclude<WorkspaceMode, "prompt">;

const toolCopy: Record<ImageToolMode, { title: string; eyebrow: string; endpoint: string }> = {
  erase: {
    title: "Erase",
    eyebrow: "Mask cleanup",
    endpoint: "flux-tools/erase-v1"
  },
  inpaint: {
    title: "Inpaint",
    eyebrow: "Mask replacement",
    endpoint: "flux-pro-1.0-fill"
  },
  outpaint: {
    title: "Outpaint",
    eyebrow: "Canvas expansion",
    endpoint: "flux-tools/outpainting-v1"
  },
  glyphs: {
    title: "Glyphs",
    eyebrow: "Sticker and SVG lab",
    endpoint: "cutout/vectorize"
  }
};

function imageSource(asset: AssetRecord | null) {
  return asset?.imageDataUrl || asset?.sampleUrl || asset?.imageUrl || asset?.image_url || "";
}

function SourceImage({ asset }: { asset: AssetRecord }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imageSource(asset)} alt={asset.title || asset.id} />
  );
}

function EmptyToolState() {
  return (
    <div className="imageToolEmpty">
      <ImagePlus size={34} />
      <strong>No source image</strong>
      <span>Select an output and send it to this workspace.</span>
    </div>
  );
}

function ToolPreview({ mode, sourceAsset }: { mode: ImageToolMode; sourceAsset: AssetRecord | null }) {
  if (!sourceAsset) return <EmptyToolState />;

  if (mode === "outpaint") {
    return (
      <div className="outpaintPreview">
        <div className="outpaintCanvasPad">
          <SourceImage asset={sourceAsset} />
        </div>
      </div>
    );
  }

  if (mode === "glyphs") {
    return (
      <div className="glyphWorkbench">
        <div className="glyphSource">
          <SourceImage asset={sourceAsset} />
        </div>
        <div className="glyphPreviewGrid" aria-label="Glyph extraction previews">
          {["Core", "Mask", "SVG", "Motion"].map((label) => (
            <div className="glyphPreview" key={label}>
              <span />
              <small>{label}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="maskPreview">
      <SourceImage asset={sourceAsset} />
      <span className="maskShape maskShapeOne" />
      <span className="maskShape maskShapeTwo" />
    </div>
  );
}

type ImageToolWorkspaceProps = {
  mode: ImageToolMode;
  sourceAsset: AssetRecord | null;
  onClearSource: () => void;
};

export function ImageToolWorkspace({ mode, sourceAsset, onClearSource }: ImageToolWorkspaceProps) {
  const copy = toolCopy[mode];
  return (
    <section className={`panel editor imageToolWorkspace ${mode}`}>
      <div className="panelHeader">
        <div>
          <h2>{copy.title}</h2>
          <p>{sourceAsset?.title || sourceAsset?.id || copy.eyebrow}</p>
        </div>
        <div className="workspaceHeaderActions">
          <span>{copy.endpoint}</span>
          {sourceAsset && (
            <button className="iconButton" onClick={onClearSource} title="Clear source" type="button">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="imageToolCanvas">
        <ToolPreview mode={mode} sourceAsset={sourceAsset} />
      </div>

      <div className="imageToolMeta">
        <div>
          <span>Source</span>
          <strong>{sourceAsset ? sourceAsset.model : "None"}</strong>
        </div>
        <div>
          <span>Operation</span>
          <strong>{copy.eyebrow}</strong>
        </div>
        <div>
          <span>Output</span>
          <strong>{mode === "glyphs" ? "SVG + mask" : "Image"}</strong>
        </div>
      </div>
    </section>
  );
}
