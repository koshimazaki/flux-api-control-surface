import { useEffect, useState } from "react";

/** Wall time survives tab sleep and server reconnects; no accumulated ticks. */
export function useGenerationClock(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(() => { if (!document.hidden) tick(); }, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active]);
  return now;
}
