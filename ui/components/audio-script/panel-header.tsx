import { Clipboard, Download, Play, RotateCcw, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { formatSeconds } from "@/lib/audio-script";
import type { AudioAnalysisResult } from "@/lib/audio-analysis";

type PanelHeaderProps = {
  analysis: AudioAnalysisResult | null;
  markerCount: number;
  hasAudioFile: boolean;
  isAnalyzing: boolean;
  hasMarkers: boolean;
  canReset: boolean;
  onAudioInput: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onReset: () => void;
  onCopy: () => void;
  onDownload: () => void;
};

export function PanelHeader(props: PanelHeaderProps) {
  const {
    analysis,
    markerCount,
    hasAudioFile,
    isAnalyzing,
    hasMarkers,
    canReset,
    onAudioInput,
    onAnalyze,
    onReset,
    onCopy,
    onDownload
  } = props;

  return (
    <div className="panelHeader">
      <div>
        <h2>Audio Script</h2>
        <p>{analysis ? `${markerCount} timing bars from ${formatSeconds(analysis.analyzedDuration)}s` : "Waveform, spectral hits, and shot timing"}</p>
      </div>
      <div className="assetActions">
        <label className="fileButton">
          <Upload size={16} />
          Audio
          <input type="file" accept="audio/*" onChange={onAudioInput} />
        </label>
        <button onClick={onAnalyze} disabled={!hasAudioFile || isAnalyzing}>
          <Play size={16} />
          {isAnalyzing ? "Analyzing" : "Analyze"}
        </button>
        <button onClick={onReset} disabled={!canReset}>
          <RotateCcw size={16} />
          Reset
        </button>
        <button onClick={onCopy} disabled={!hasMarkers}>
          <Clipboard size={16} />
          Copy
        </button>
        <button onClick={onDownload} disabled={!hasMarkers}>
          <Download size={16} />
          TXT
        </button>
      </div>
    </div>
  );
}
