import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type VideoComparisonFaderProps = {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export function VideoComparisonFader({ beforeUrl, afterUrl, beforeLabel = "Source", afterLabel = "Upscaled" }: VideoComparisonFaderProps) {
  const beforeRef = useRef<HTMLVideoElement | null>(null);
  const afterRef = useRef<HTMLVideoElement | null>(null);
  const [split, setSplit] = useState(50);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setPlaying(false);
    beforeRef.current?.pause();
    afterRef.current?.pause();
  }, [afterUrl, beforeUrl]);

  function synchronize() {
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!before || !after) return;
    if (Math.abs(after.currentTime - before.currentTime) > 0.08) after.currentTime = before.currentTime;
  }

  async function togglePlayback() {
    const before = beforeRef.current;
    const after = afterRef.current;
    if (!before || !after) return;
    if (playing) {
      before.pause();
      after.pause();
      setPlaying(false);
      return;
    }
    after.currentTime = before.currentTime;
    try {
      await Promise.all([before.play(), after.play()]);
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <div className="videoCompare">
      <div className="videoCompareStage">
        <video
          ref={beforeRef}
          src={beforeUrl}
          playsInline
          muted
          loop
          preload="metadata"
          onTimeUpdate={synchronize}
          onPause={() => setPlaying(false)}
          aria-label={`${beforeLabel} video`}
        />
        <div className="videoCompareAfter" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
          <video ref={afterRef} src={afterUrl} playsInline muted loop preload="metadata" aria-label={`${afterLabel} video`} />
        </div>
        <span className="videoCompareLabel before">{beforeLabel}</span>
        <span className="videoCompareLabel after">{afterLabel}</span>
        <div className="videoCompareDivider" style={{ left: `${split}%` }} aria-hidden="true"><i /></div>
        <input
          aria-label="Move before and after comparison divider"
          type="range"
          min="0"
          max="100"
          value={split}
          onChange={(event) => setSplit(Number(event.target.value))}
        />
      </div>
      <button type="button" className="videoComparePlay" onClick={togglePlayback}>
        {playing ? <Pause size={15} /> : <Play size={15} />}
        {playing ? "Pause comparison" : "Play comparison"}
      </button>
    </div>
  );
}
