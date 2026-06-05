import { Activity, Repeat } from "lucide-react";
import type { PointerEvent, RefObject } from "react";
import { formatSeconds } from "@/lib/audio-script";

type WaveformShellProps = {
  zoom: number;
  waveformTrackRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sliceOverlayRef: RefObject<HTMLDivElement | null>;
  sliceStartPercent: number;
  sliceEndPercent: number;
  playheadPercent: number;
  sliceStartSeconds: number;
  sliceEndSeconds: number;
  currentTime: number;
  onWaveformPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
  onWaveformPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
  onWaveformPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
  onSliceHandlePointerDown: (boundary: "start" | "end", event: PointerEvent<HTMLButtonElement>) => void;
  onSliceHandlePointerMove: (boundary: "start" | "end", event: PointerEvent<HTMLButtonElement>) => void;
  onSliceHandlePointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function WaveformShell(props: WaveformShellProps) {
  const {
    zoom,
    waveformTrackRef,
    canvasRef,
    sliceOverlayRef,
    sliceStartPercent,
    sliceEndPercent,
    playheadPercent,
    sliceStartSeconds,
    sliceEndSeconds,
    currentTime,
    onWaveformPointerDown,
    onWaveformPointerMove,
    onWaveformPointerUp,
    onSliceHandlePointerDown,
    onSliceHandlePointerMove,
    onSliceHandlePointerUp
  } = props;

  return (
    <div className="audioWaveformShell">
      <div className="audioWaveformTrack" ref={waveformTrackRef} style={{ width: `${zoom * 100}%` }}>
        <canvas
          ref={canvasRef}
          className="audioWaveformCanvas"
          onPointerDown={onWaveformPointerDown}
          onPointerMove={onWaveformPointerMove}
          onPointerUp={onWaveformPointerUp}
        />
        <div className="audioSliceOverlay" ref={sliceOverlayRef}>
          <div
            className="audioSliceWindow"
            style={{
              left: `${Math.min(sliceStartPercent, sliceEndPercent)}%`,
              width: `${Math.max(0, sliceEndPercent - sliceStartPercent)}%`
            }}
          />
          <button
            className="audioSliceHandle start"
            style={{ left: `${sliceStartPercent}%` }}
            onPointerDown={(event) => onSliceHandlePointerDown("start", event)}
            onPointerMove={(event) => onSliceHandlePointerMove("start", event)}
            onPointerUp={onSliceHandlePointerUp}
            title="Drag start bracket"
          />
          <button
            className="audioSliceHandle end"
            style={{ left: `${sliceEndPercent}%` }}
            onPointerDown={(event) => onSliceHandlePointerDown("end", event)}
            onPointerMove={(event) => onSliceHandlePointerMove("end", event)}
            onPointerUp={onSliceHandlePointerUp}
            title="Drag end bracket"
          />
          <div className="audioPlayhead" style={{ left: `${playheadPercent}%` }}>
            <span>{formatSeconds(currentTime, 2)}s</span>
          </div>
        </div>
      </div>
      <div className="audioLegend">
        <span><i className="low" />Low</span>
        <span><i className="mid" />Mid</span>
        <span><i className="high" />High</span>
        <span><Activity size={13} />Amplitude</span>
        <span><Repeat size={13} />{formatSeconds(sliceStartSeconds, 2)}s-{formatSeconds(sliceEndSeconds, 2)}s</span>
        <span>Now {formatSeconds(currentTime, 2)}s</span>
      </div>
    </div>
  );
}
