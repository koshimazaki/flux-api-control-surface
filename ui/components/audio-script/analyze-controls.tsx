import {
  audioWindowFitLabel,
  audioWindowMaxSeconds,
  audioWindowStepSeconds,
  audioWindowSteps,
  clamp
} from "@/lib/audio-script";

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
        {/* A fader in the 5s increments shots are chopped at, so the window
            lands on a real clip boundary instead of an arbitrary number. */}
        <input
          className="audioWindowFader"
          type="range"
          min={audioWindowStepSeconds}
          max={audioWindowMaxSeconds}
          step={audioWindowStepSeconds}
          list="audioWindowTicks"
          value={clamp(durationSeconds, audioWindowStepSeconds, audioWindowMaxSeconds)}
          aria-label="Analysis window length in seconds"
          aria-valuetext={audioWindowFitLabel(durationSeconds)}
          onChange={(event) =>
            onSetDurationSeconds(clamp(Number(event.target.value) || audioWindowStepSeconds, audioWindowStepSeconds, audioWindowMaxSeconds))
          }
        />
        <datalist id="audioWindowTicks">
          {audioWindowSteps.map((step) => (
            <option key={step} value={step} label={`${step}`} />
          ))}
        </datalist>
        <small className="audioWindowFit">{audioWindowFitLabel(durationSeconds)}</small>
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
