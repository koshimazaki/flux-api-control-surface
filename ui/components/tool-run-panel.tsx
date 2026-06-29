import { ChevronDown, Clipboard, Eraser, Fingerprint, Focus, Maximize2, Shirt } from "lucide-react";
import { MetaBox } from "@/components/ui/meta-box";
import { PanelHeader } from "@/components/ui/panel-header";
import { RunButton } from "@/components/ui/run-button";
import { SeedControl } from "@/components/seed-control";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";
import type { ToolOutputFormat } from "@/lib/dashboard-tools";

type ToolMode = Exclude<WorkspaceMode, "prompt">;

const toolRunCopy: Record<ToolMode, { title: string; action: string; endpoint: string; icon: typeof Eraser }> = {
  erase: {
    title: "Erase",
    action: "Run Erase",
    endpoint: "flux-tools/erase-v1",
    icon: Eraser
  },
  vto: {
    title: "Virtual Try-On",
    action: "Run VTO",
    endpoint: "flux-tools/vto-v1",
    icon: Shirt
  },
  outpaint: {
    title: "Outpaint",
    action: "Run Outpaint",
    endpoint: "flux-tools/outpainting-v1",
    icon: Maximize2
  },
  deblur: {
    title: "Deblur",
    action: "Run Deblur",
    endpoint: "flux-tools/deblur-v1",
    icon: Focus
  },
  glyphs: {
    title: "Glyphs",
    action: "Build Glyph",
    endpoint: "local · imagetracer",
    icon: Fingerprint
  }
};

type ToolRunPanelProps = {
  mode: ToolMode;
  sourceAsset: AssetRecord | null;
  width: number;
  height: number;
  seed: string;
  seedLocked: boolean;
  promptText: string;
  vtoGarmentCount: number;
  mask: string;
  brushSize: number;
  dilatePixels: number;
  guidance: number;
  steps: number;
  safetyTolerance: number;
  outputFormat: ToolOutputFormat;
  offsetX: string;
  offsetY: string;
  outpaintMode: "high" | "fast";
  autoCrop: boolean;
  isGenerating: boolean;
  error: string;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onSeedChange: (value: string) => void;
  onSeedLockedChange: (value: boolean) => void;
  onRandomSeed: () => void;
  onPromptChange: (value: string) => void;
  onBrushSizeChange: (value: number) => void;
  onDilatePixelsChange: (value: number) => void;
  onGuidanceChange: (value: number) => void;
  onStepsChange: (value: number) => void;
  onSafetyToleranceChange: (value: number) => void;
  onOutputFormatChange: (value: ToolOutputFormat) => void;
  onOffsetXChange: (value: string) => void;
  onOffsetYChange: (value: string) => void;
  onOutpaintModeChange: (value: "high" | "fast") => void;
  onAutoCropChange: (value: boolean) => void;
  onClearMask: () => void;
  onUseGeneratePrompt: () => void;
  onRun: () => void;
};

export function ToolRunPanel(props: ToolRunPanelProps) {
  const copy = toolRunCopy[props.mode];
  const Icon = copy.icon;
  const needsPrompt = props.mode === "vto" || props.mode === "outpaint";
  const needsMask = props.mode === "erase";
  const isGlyphs = props.mode === "glyphs";
  const supportsSafetyTolerance = props.mode === "vto" || props.mode === "deblur";
  const outputFormats: ToolOutputFormat[] =
    props.mode === "erase" || props.mode === "outpaint" ? ["png", "jpeg"] : ["png", "jpeg", "webp"];
  const safetyToleranceMax = 5;
  const safetyTolerance = Math.min(props.safetyTolerance, safetyToleranceMax);
  const promptLabel =
    props.mode === "vto" ? "VTO prompt" : props.mode === "outpaint" ? "Outpaint prompt (optional)" : "Prompt";
  const runBlocked =
    !props.sourceAsset ||
    isGlyphs ||
    (needsMask && !props.mask) ||
    (props.mode === "vto" && (!props.vtoGarmentCount || !props.promptText.trim()));

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

      {props.mode === "vto" && (
        <MetaBox className="toolEndpointBox" label="Garments" value={`${props.vtoGarmentCount}/4`} />
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
          Glyphs runs locally: drag a box over an icon on the canvas, tune colors/cut, then
          Vectorize and Save to the library (PNG + SVG). No BFL credits used.
        </p>
      )}

      {props.mode === "deblur" && (
        <p className="toolStubNote">
          Deblur sharpens the whole source image. It does not use a mask or prompt, so only seed,
          safety tolerance, and output format are sent.
        </p>
      )}

      {!isGlyphs && (
        <details className="toolAdvanced">
          <summary>
            <span>Advanced</span>
            <ChevronDown className="toolAdvancedChevron" size={15} />
          </summary>
          <div className="toolAdvancedFields">
            {supportsSafetyTolerance && (
              <label>
                Safety tolerance · {safetyTolerance}
                <input
                  type="range"
                  min={0}
                  max={safetyToleranceMax}
                  step={1}
                  value={safetyTolerance}
                  onChange={(event) => props.onSafetyToleranceChange(Number(event.target.value))}
                />
              </label>
            )}
            <label>
              Output format
              <select
                value={outputFormats.includes(props.outputFormat) ? props.outputFormat : "png"}
                onChange={(event) => props.onOutputFormatChange(event.target.value as ToolOutputFormat)}
              >
                {outputFormats.map((format) => (
                  <option key={format} value={format}>
                    {format.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            {props.mode === "outpaint" && (
              <label className="toolToggleRow">
                <input
                  type="checkbox"
                  checked={props.autoCrop}
                  onChange={(event) => props.onAutoCropChange(event.target.checked)}
                />
                Auto crop
              </label>
            )}
          </div>
        </details>
      )}

      {needsPrompt && (
        <label>
          <span className="toolPromptHeader">
            {promptLabel}
            <button type="button" onClick={props.onUseGeneratePrompt} title="Copy Generate prompt">
              <Clipboard size={14} />
              Use Generate
            </button>
          </span>
          <textarea
            className="toolPrompt"
            value={props.promptText}
            onChange={(event) => props.onPromptChange(event.target.value)}
          />
        </label>
      )}

      {!isGlyphs && (
        <SeedControl
          value={props.seed}
          locked={props.seedLocked}
          onChange={props.onSeedChange}
          onLockedChange={props.onSeedLockedChange}
          onRandomize={props.onRandomSeed}
        />
      )}

      <RunButton isRunning={props.isGenerating} onClick={props.onRun} disabled={runBlocked}>
        {copy.action}
      </RunButton>
      {props.error && <p className="errorText">{props.error}</p>}
    </aside>
  );
}
