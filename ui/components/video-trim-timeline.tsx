import { Save, Scissors } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  VIDEO_TRIM_FPS,
  VIDEO_TRIM_FRAME_SECONDS,
  VIDEO_TRIM_MAX_SECONDS,
  clampTrimSelection,
  formatTimecode,
  framesIn,
  moveTrimSelection,
  trimRulerSeconds,
  trimSelectionBlocker,
  type TrimSelection
} from "@/lib/video-trim";

type Grab = "body" | "start" | "end";

type VideoTrimTimelineProps = {
  duration: number;
  selection: TrimSelection;
  onSelectionChange: (selection: TrimSelection) => void;
  onCut: () => void;
  isCutting: boolean;
  /** Where the source clip is currently playing, so the bracket can be read against it. */
  playheadSeconds?: number;
};

function percent(value: number, duration: number) {
  return duration > 0 ? `${Math.max(0, Math.min(100, (value / duration) * 100))}%` : "0%";
}

/**
 * The bracket over a clip's full length: drag the middle to slide it, drag an
 * edge to resize, arrow keys step one frame at a time. It can be as short as 17
 * frames and never longer than the 15 seconds Video Edit accepts, so an
 * over-length render can be cut down without leaving the tool.
 */
export function VideoTrimTimeline(props: VideoTrimTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [grab, setGrab] = useState<Grab | null>(null);
  const { duration, selection } = props;
  const length = Math.max(0, selection.end - selection.start);
  const blocker = trimSelectionBlocker(selection, duration);
  // Second ticks while the clip is short enough to read them; every five otherwise.
  const ruler = trimRulerSeconds(duration, duration > 40 ? 5 : 1);
  // How far the bracket may still stretch from where it starts.
  const reach = Math.min(duration, selection.start + VIDEO_TRIM_MAX_SECONDS);

  function secondsAt(clientX: number) {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  }

  function applyGrab(kind: Grab, clientX: number, offsetSeconds: number) {
    const at = secondsAt(clientX);
    if (kind === "body") {
      props.onSelectionChange(moveTrimSelection(selection, at - offsetSeconds, duration));
      return;
    }
    const next = kind === "start" ? { start: at, end: selection.end } : { start: selection.start, end: at };
    props.onSelectionChange(clampTrimSelection(next, duration));
  }

  function startGrab(kind: Grab, event: ReactPointerEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    // Grabbing the body must not jump the bracket to the pointer: keep the
    // offset between where it was taken hold of and its start.
    const offsetSeconds = kind === "body" ? secondsAt(event.clientX) - selection.start : 0;
    setGrab(kind);

    const move = (moveEvent: PointerEvent) => applyGrab(kind, moveEvent.clientX, offsetSeconds);
    const release = () => {
      setGrab(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  function nudge(kind: Grab, frames: number) {
    const delta = frames * VIDEO_TRIM_FRAME_SECONDS;
    if (kind === "body") {
      props.onSelectionChange(moveTrimSelection(selection, selection.start + delta, duration));
      return;
    }
    const next = kind === "start"
      ? { start: selection.start + delta, end: selection.end }
      : { start: selection.start, end: selection.end + delta };
    props.onSelectionChange(clampTrimSelection(next, duration));
  }

  /** One frame per press, a second with shift held. */
  function handleKey(kind: Grab, event: React.KeyboardEvent) {
    const step = event.shiftKey ? VIDEO_TRIM_FPS : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(kind, -step);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(kind, step);
    }
  }

  return (
    <section className="videoTrim">
      <div className="videoTrimHeader">
        <span><Scissors size={13} />Cut to 15 seconds</span>
        <span className="videoTrimReadout">
          {formatTimecode(selection.start)} → {formatTimecode(selection.end)} ·{" "}
          <strong>{length.toFixed(2)} s</strong> · {framesIn(length)} frames
        </span>
      </div>
      <div
        className={`videoTrimTrack${grab ? " grabbing" : ""}`}
        ref={trackRef}
        onPointerDown={(event) => {
          // A press on open track re-places the bracket there rather than doing nothing.
          if (event.target === event.currentTarget) {
            props.onSelectionChange(moveTrimSelection(selection, secondsAt(event.clientX), duration));
          }
        }}
      >
        {ruler.map((second) => (
          <i
            className={`videoTrimTick${second % 5 === 0 ? " major" : ""}`}
            style={{ left: percent(second, duration) }}
            key={second}
            aria-hidden="true"
          />
        ))}
        {/* The furthest the bracket can reach from its current start. */}
        {reach < duration && (
          <i className="videoTrimReach" style={{ left: percent(reach, duration) }} aria-hidden="true" />
        )}
        {typeof props.playheadSeconds === "number" && (
          <div className="videoTrimPlayhead" style={{ left: percent(props.playheadSeconds, duration) }} aria-hidden="true" />
        )}
        <div
          className="videoTrimBracket"
          style={{ left: percent(selection.start, duration), width: percent(length, duration) }}
          onPointerDown={(event) => startGrab("body", event)}
          role="slider"
          tabIndex={0}
          aria-label="Cut selection"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={selection.start}
          aria-valuetext={`${formatTimecode(selection.start)} to ${formatTimecode(selection.end)}, ${framesIn(length)} frames`}
          onKeyDown={(event) => handleKey("body", event)}
        >
          <button
            type="button"
            className="videoTrimHandle start"
            aria-label="Cut start"
            onPointerDown={(event) => startGrab("start", event)}
            onKeyDown={(event) => handleKey("start", event)}
          />
          <span>{length.toFixed(1)} s</span>
          <button
            type="button"
            className="videoTrimHandle end"
            aria-label="Cut end"
            onPointerDown={(event) => startGrab("end", event)}
            onKeyDown={(event) => handleKey("end", event)}
          />
        </div>
      </div>
      <div className="videoTrimFooter">
        <small>
          {blocker || `Drag to place the cut; arrow keys step one frame, shift one second. ${VIDEO_TRIM_FPS} fps grid, 15 s maximum.`}
        </small>
        <button type="button" className="videoTrimSave" onClick={props.onCut} disabled={Boolean(blocker) || props.isCutting}>
          <Save size={14} />
          {props.isCutting ? "Cutting…" : "Save cut"}
        </button>
      </div>
    </section>
  );
}
