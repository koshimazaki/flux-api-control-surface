import { ImagePlus, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
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
      <PanelHeader title={copy.title} subtitle={sourceAsset?.title || sourceAsset?.id || copy.eyebrow}>
        <div className="workspaceHeaderActions">
          <span>{copy.endpoint}</span>
          {sourceAsset && (
            <IconButton onClick={onClearSource} title="Clear source">
              <X size={14} />
            </IconButton>
          )}
        </div>
      </PanelHeader>

      <div className="imageToolCanvas">
        <ToolPreview mode={mode} sourceAsset={sourceAsset} />
      </div>

      <div className="imageToolMeta">
        <MetaBox label="Source" value={sourceAsset ? sourceAsset.model : "None"} />
        <MetaBox label="Operation" value={copy.eyebrow} />
        <MetaBox label="Output" value={mode === "glyphs" ? "SVG + mask" : "Image"} />
      </div>
    </section>
  );
}
