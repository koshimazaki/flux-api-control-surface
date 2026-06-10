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
    endpoint: "cutout/vectorize",
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
  isGenerating: boolean;
  error: string;
  onWidthChange: (value: number) => void;
  onHeightChange: (value: number) => void;
  onSeedChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRun: () => void;
};

export function ToolRunPanel(props: ToolRunPanelProps) {
  const copy = toolRunCopy[props.mode];
  const Icon = copy.icon;
  const needsPrompt = props.mode === "inpaint" || props.mode === "outpaint" || props.mode === "glyphs";

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
          Mask dilation
          <input type="range" min={0} max={25} defaultValue={10} />
        </label>
      )}

      {(props.mode === "inpaint" || props.mode === "erase") && (
        <label>
          Brush size
          <input type="range" min={4} max={160} defaultValue={48} />
        </label>
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
              <input type="number" placeholder="center" />
            </label>
            <label>
              Offset Y
              <input type="number" placeholder="center" />
            </label>
          </div>
          <label>
            Mode
            <select defaultValue="high">
              <option value="high">High</option>
              <option value="fast">Fast</option>
            </select>
          </label>
        </>
      )}

      {props.mode === "glyphs" && (
        <>
          <label>
            Output
            <select defaultValue="svg">
              <option value="svg">SVG icon</option>
              <option value="sticker">Transparent sticker</option>
              <option value="mask">Animated mask</option>
            </select>
          </label>
          <label>
            Simplify
            <input type="range" min={1} max={10} defaultValue={6} />
          </label>
        </>
      )}

      {needsPrompt && (
        <label>
          Prompt
          <textarea
            className="toolPrompt"
            value={props.promptText}
            onChange={(event) => props.onPromptChange(event.target.value)}
          />
        </label>
      )}

      <label>
        Seed
        <input value={props.seed} onChange={(event) => props.onSeedChange(event.target.value)} placeholder="optional" />
      </label>

      <RunButton isRunning={props.isGenerating} onClick={props.onRun} disabled={!props.sourceAsset}>
        {copy.action}
      </RunButton>
      {props.error && <p className="errorText">{props.error}</p>}
    </aside>
  );
}
