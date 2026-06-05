import { clamp } from "@/lib/audio-script";

type AnalyzeControlsProps = {
  startSeconds: number;
  durationSeconds: number;
  shotCount: number;
  onSetStartSeconds: (value: number) => void;
  onSetDurationSeconds: (value: number) => void;
  onSetShotCount: (value: number) => void;
};

export function AnalyzeControls(props: AnalyzeControlsProps) {
  const { startSeconds, durationSeconds, shotCount, onSetStartSeconds, onSetDurationSeconds, onSetShotCount } = props;

  return (
    <div className="audioControls">
      <label>
        Analyze start
        <input type="number" min={0} step={0.1} value={startSeconds} onChange={(event) => onSetStartSeconds(Number(event.target.value) || 0)} />
      </label>
      <label>
        Analyze length
        <input
          type="number"
          min={1}
          max={15}
          step={0.5}
          value={durationSeconds}
          onChange={(event) => onSetDurationSeconds(clamp(Number(event.target.value) || 15, 1, 15))}
        />
      </label>
      <label>
        Bars
        <input
          type="number"
          min={1}
          max={24}
          step={1}
          value={shotCount}
          onChange={(event) => onSetShotCount(clamp(Number(event.target.value) || 6, 1, 24))}
        />
      </label>
    </div>
  );
}
