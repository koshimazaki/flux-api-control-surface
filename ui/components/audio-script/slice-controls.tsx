import { Download, Scissors, Video } from "lucide-react";
import { clamp, formatSeconds } from "@/lib/audio-script";
import type { AudioExportFormat } from "./types";

type SliceControlsProps = {
  startDraft: string;
  endDraft: string;
  exportLoopCount: number;
  previewLoop: boolean;
  sliceDuration: number;
  hasAudioUrl: boolean;
  hasAudioFile: boolean;
  exportingFormat: AudioExportFormat | "";
  hasAnalysis: boolean;
  isRenderingGuide: boolean;
  onSetStartDraft: (value: string) => void;
  onSetEndDraft: (value: string) => void;
  onSetStartFocused: (value: boolean) => void;
  onSetEndFocused: (value: boolean) => void;
  onCommitSliceDraft: (boundary: "start" | "end") => void;
  onSetExportLoopCount: (value: number) => void;
  onSetPreviewLoop: (value: boolean) => void;
  onPlaySlice: () => void;
  onExportSlice: (format: AudioExportFormat) => void;
  onExportGuide: () => void;
};

export function SliceControls(props: SliceControlsProps) {
  const {
    startDraft,
    endDraft,
    exportLoopCount,
    previewLoop,
    sliceDuration,
    hasAudioUrl,
    hasAudioFile,
    exportingFormat,
    hasAnalysis,
    isRenderingGuide,
    onSetStartDraft,
    onSetEndDraft,
    onSetStartFocused,
    onSetEndFocused,
    onCommitSliceDraft,
    onSetExportLoopCount,
    onSetPreviewLoop,
    onPlaySlice,
    onExportSlice,
    onExportGuide
  } = props;

  return (
    <div className="audioSliceControls">
      <label>
        Start bracket
        <input
          type="text"
          inputMode="decimal"
          value={startDraft}
          onFocus={() => onSetStartFocused(true)}
          onChange={(event) => onSetStartDraft(event.target.value)}
          onBlur={() => onCommitSliceDraft("start")}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      <label>
        End bracket
        <input
          type="text"
          inputMode="decimal"
          value={endDraft}
          onFocus={() => onSetEndFocused(true)}
          onChange={(event) => onSetEndDraft(event.target.value)}
          onBlur={() => onCommitSliceDraft("end")}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      <label>
        Loops
        <input
          type="number"
          min={1}
          max={64}
          step={1}
          value={exportLoopCount}
          onChange={(event) => onSetExportLoopCount(clamp(Math.round(Number(event.target.value) || 1), 1, 64))}
        />
      </label>
      <label className="toggle audioLoopToggle">
        <input type="checkbox" checked={previewLoop} onChange={(event) => onSetPreviewLoop(event.target.checked)} />
        Loop preview
      </label>
      <button onClick={onPlaySlice} disabled={!hasAudioUrl}>
        <Scissors size={16} />
        Play slice
      </button>
      <button onClick={() => onExportSlice("mp3")} disabled={!hasAudioFile || Boolean(exportingFormat)}>
        <Download size={16} />
        {exportingFormat === "mp3" ? "MP3..." : "MP3"}
      </button>
      <button onClick={() => onExportSlice("wav")} disabled={!hasAudioFile || Boolean(exportingFormat)}>
        <Download size={16} />
        {exportingFormat === "wav" ? "WAV..." : "WAV"}
      </button>
      <button onClick={onExportGuide} disabled={!hasAnalysis || isRenderingGuide}>
        <Video size={16} />
        {isRenderingGuide ? "Guide..." : "Guide MP4"}
      </button>
      <small>
        {formatSeconds(sliceDuration, 2)}s x {exportLoopCount}
      </small>
    </div>
  );
}
