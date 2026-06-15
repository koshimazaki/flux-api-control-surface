import { Eraser, Fingerprint, Maximize2, Paintbrush } from "lucide-react";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";

type ToolMode = Exclude<WorkspaceMode, "prompt">;

const toolRunCopy: Record<ToolMode, { title: string; action: string; endpoint: string; icon: typeof Eraser }> = {
  erase: {
    title: "Erase",
    action: "Run Erase",
    endpoint: "flux-tools/erase-v1",
    icon: Eraser
  },
  inpaint: {
    title: "Inpaint",
    action: "Run Inpaint",
    endpoint: "flux-pro-1.0-fill",
    icon: Paintbrush
  },
  outpaint: {
    title: "Outpaint",
    action: "Run Outpaint",
    endpoint: "flux-tools/outpainting-v1",
    icon: Maximize2
  },
  glyphs: {
    title: "Glyphs",
    action: "Build Glyph",
    endpoint: "no endpoint yet",
    icon: Fingerprint
  }
};

type ToolRunPanelProps = {
  mode: ToolMode;
  sourceAsset: AssetRecord | null;
  width: number;
  height: number;
  seed: string;
  promptText: string;
  mask: string;
  brushSize: number;
  dilatePixels: number;
  offsetX: string;
  offsetY: string;
  outpaintMode: "high" | "fast";
  isGenerating: boolean;
  error: string;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onSeedChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onBrushSizeChange: (value: number) => void;
  onDilatePixelsChange: (value: number) => void;
  onOffsetXChange: (value: string) => void;
  onOffsetYChange: (value: string) => void;
  onOutpaintModeChange: (value: "high" | "fast") => void;
  onClearMask: () => void;
  onRun: () => void;
};

export function ToolRunPanel(props: ToolRunPanelProps) {
  const copy = toolRunCopy[props.mode];
  const Icon = copy.icon;
  const needsPrompt = props.mode === "inpaint" || props.mode === "outpaint";
  const needsMask = props.mode === "erase" || props.mode === "inpaint";
  const isGlyphs = props.mode === "glyphs";
  const runBlocked =
    !props.sourceAsset ||
    isGlyphs ||
    (needsMask && !props.mask) ||
    (props.mode === "inpaint" && !props.promptText.trim());

  return (
    <aside className="panel controls toolControls">
      <PanelHeader
        title={copy.title}
        subtitle={props.sourceAsset ? props.sourceAsset.title || props.sourceAsset.id : "No source loaded"}
      >
        <Icon size={18} />
      </PanelHeader>

      <MetaBox className="toolEndpointBox" label="Endpoint" value={copy.endpoint} />

      {props.mode === "erase" && (
        <label>
          Mask dilation · {props.dilatePixels}px
          <input
            type="range"
            min={0}
            max={25}
            value={props.dilatePixels}
            onChange={(event) => props.onDilatePixelsChange(Number(event.target.value))}
          />
        </label>
      )}

      {needsMask && (
        <>
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
          <div className="maskStatusRow">
            <span>{props.mask ? "Mask painted" : "Paint the area on the image"}</span>
            <button type="button" onClick={props.onClearMask} disabled={!props.mask}>
              Clear mask
            </button>
          </div>
        </>
      )}

      {props.mode === "outpaint" && (
        <>
          <div className="sizeGrid">
            <label>
              Canvas W
              <input type="number" min={64} step={16} value={props.width} onChange={(event) => props.onWidthChange(Number(event.target.value))} />
            </label>
            <label>
              Canvas H
              <input type="number" min={64} step={16} value={props.height} onChange={(event) => props.onHeightChange(Number(event.target.value))} />
            </label>
          </div>
          <div className="sizeGrid">
            <label>
              Offset X
              <input
                type="number"
                placeholder="center"
                value={props.offsetX}
                onChange={(event) => props.onOffsetXChange(event.target.value)}
              />
            </label>
            <label>
              Offset Y
              <input
                type="number"
                placeholder="center"
                value={props.offsetY}
                onChange={(event) => props.onOffsetYChange(event.target.value)}
              />
            </label>
          </div>
          <label>
            Mode
            <select
              value={props.outpaintMode}
              onChange={(event) => props.onOutpaintModeChange(event.target.value === "fast" ? "fast" : "high")}
            >
              <option value="high">High</option>
              <option value="fast">Fast</option>
            </select>
          </label>
        </>
      )}

      {isGlyphs && (
        <p className="toolStubNote">
          BFL has no cutout/vectorize endpoint. This lane is staged for a local vectorizer or Comfy
          workflow provider.
        </p>
      )}

      {needsPrompt && (
        <label>
          Prompt {props.mode === "outpaint" ? "(optional, experimental)" : ""}
          <textarea
            className="toolPrompt"
            value={props.promptText}
            onChange={(event) => props.onPromptChange(event.target.value)}
          />
        </label>
      )}

      {props.mode !== "outpaint" && !isGlyphs && (
        <label>
          Seed
          <input value={props.seed} onChange={(event) => props.onSeedChange(event.target.value)} placeholder="optional" />
        </label>
      )}

      <RunButton isRunning={props.isGenerating} onClick={props.onRun} disabled={runBlocked}>
        {copy.action}
      </RunButton>
      {props.error && <p className="errorText">{props.error}</p>}
    </aside>
  );
}
