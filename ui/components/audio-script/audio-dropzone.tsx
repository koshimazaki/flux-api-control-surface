import { Music, Pause, Play } from "lucide-react";
import type { RefObject } from "react";
import { formatClock } from "./panel-helpers";

type AudioDropzoneProps = {
  audioRef: RefObject<HTMLAudioElement | null>;
  audioFileName: string | undefined;
  audioUrl: string;
  audioDuration: number;
  currentTime: number;
  isPlaying: boolean;
  onDropFiles: (files: File[]) => void;
  onLoadedMetadata: (duration: number, currentTime: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onSeeked: (currentTime: number) => void;
  onTimeUpdate: () => void;
  onTogglePlayback: () => void;
  onSeek: (seconds: number) => void;
};

export function AudioDropzone(props: AudioDropzoneProps) {
  const {
    audioRef,
    audioFileName,
    audioUrl,
    audioDuration,
    currentTime,
    isPlaying,
    onDropFiles,
    onLoadedMetadata,
    onPlay,
    onPause,
    onEnded,
    onSeeked,
    onTimeUpdate,
    onTogglePlayback,
    onSeek
  } = props;

  return (
    <div
      className="audioDropzone"
      onDrop={(event) => {
        event.preventDefault();
        onDropFiles(Array.from(event.dataTransfer.files || []));
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      <Music size={18} />
      <span>{audioFileName || "Audio file"}</span>
      {audioUrl && (
        <>
          <audio
            ref={audioRef}
            src={audioUrl}
            className="audioPlayerNative"
            onLoadedMetadata={(event) => {
              onLoadedMetadata(event.currentTarget.duration, event.currentTarget.currentTime);
            }}
            onPlay={onPlay}
            onPause={onPause}
            onEnded={onEnded}
            onSeeked={(event) => onSeeked(event.currentTarget.currentTime)}
            onTimeUpdate={onTimeUpdate}
          />
          <div className="audioPlayer">
            <button
              type="button"
              className="audioPlayerButton"
              onClick={onTogglePlayback}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range"
              className="audioPlayerSeek"
              min={0}
              max={audioDuration || 0}
              step={0.01}
              value={Math.min(currentTime, audioDuration || 0)}
              onChange={(event) => onSeek(Number(event.target.value))}
              aria-label="Seek"
            />
            <span className="audioPlayerTime">
              {formatClock(currentTime)} / {formatClock(audioDuration)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
