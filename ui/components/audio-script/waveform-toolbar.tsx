import { Lock, Unlock, ZoomIn, ZoomOut } from "lucide-react";
import { MAX_WAVEFORM_ZOOM, MIN_WAVEFORM_ZOOM } from "./panel-helpers";

type WaveformToolbarProps = {
  zoom: number;
  selectedMarkerLocked: boolean;
  selectedMarkerId: string;
  lockedCount: number;
  onZoom: (direction: 1 | -1) => void;
  onToggleMarkerLock: () => void;
};

export function WaveformToolbar(props: WaveformToolbarProps) {
  const { zoom, selectedMarkerLocked, selectedMarkerId, lockedCount, onZoom, onToggleMarkerLock } = props;

  return (
    <div className="audioWaveformToolbar">
      <div className="audioZoomControls">
        <button onClick={() => onZoom(-1)} disabled={zoom <= MIN_WAVEFORM_ZOOM} title="Zoom out">
          <ZoomOut size={15} />
        </button>
        <span>{zoom}x</span>
        <button onClick={() => onZoom(1)} disabled={zoom >= MAX_WAVEFORM_ZOOM} title="Zoom in">
          <ZoomIn size={15} />
        </button>
      </div>
      <button
        className={selectedMarkerLocked ? "audioLockToggle locked" : "audioLockToggle"}
        onClick={onToggleMarkerLock}
        disabled={!selectedMarkerId}
        title={selectedMarkerLocked ? "Unlock selected marker" : "Lock selected marker"}
      >
        {selectedMarkerLocked ? <Lock size={15} /> : <Unlock size={15} />}
        {selectedMarkerLocked ? "Locked" : "Lock"}
      </button>
      <small>{lockedCount} locked</small>
    </div>
  );
}
