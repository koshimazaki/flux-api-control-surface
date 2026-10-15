import dynamic from "next/dynamic";
import { useCallback, useId, useRef } from "react";
import { generationPattern } from "@/lib/gallery-generations";

const PixelReveal = dynamic(() => import("@/components/generation/pixel-reveal"), { ssr: false });

/** The original three studies, with stable per-job selection shared by stage and gallery. */
export function WaitField({ active, onDone, id }: { active: boolean; onDone?: () => void; id?: string }) {
  const fallbackId = useId();
  const identity = id || fallbackId;
  const callback = useRef(onDone);
  callback.current = onDone;
  const complete = useCallback(() => callback.current?.(), []);
  return (
    <div className="waitField" aria-hidden="true" data-pattern={generationPattern(identity).variant}>
      <PixelReveal id={identity} ready={!active} paused={false} onComplete={complete} />
    </div>
  );
}
