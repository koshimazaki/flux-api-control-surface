import { Hand, Maximize2, Minus, Plus } from "lucide-react";

type CanvasZoomControlsProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  canPan?: boolean;
  handMode?: boolean;
  onToggleHand?: () => void;
};

export function CanvasZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  canPan,
  handMode,
  onToggleHand
}: CanvasZoomControlsProps) {
  return (
    <div className="canvasZoomBar">
      <button type="button" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
        <Minus size={15} />
      </button>
      <button type="button" className="canvasZoomLevel" onClick={onReset} title="Fit to view">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
        <Plus size={15} />
      </button>
      <button type="button" onClick={onReset} title="Fit to view" aria-label="Fit to view">
        <Maximize2 size={14} />
      </button>
      {onToggleHand && (
        <button
          type="button"
          className={handMode ? "active" : ""}
          onClick={onToggleHand}
          disabled={!canPan && !handMode}
          title="Pan tool (or hold Space)"
          aria-label="Pan tool"
          aria-pressed={handMode}
        >
          <Hand size={15} />
        </button>
      )}
    </div>
  );
}
