import { useEffect, type RefObject } from "react";

/**
 * Pauses any clip inside a workspace that has just been hidden.
 *
 * The video tools all stay mounted so switching tabs keeps their state and
 * buffered media, which means a hidden tab would otherwise keep playing —
 * audio included — behind the one on screen.
 */
export function usePauseHiddenMedia(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (active) return;
    const media = ref.current?.querySelectorAll("video, audio");
    media?.forEach((element) => {
      if (element instanceof HTMLMediaElement && !element.paused) element.pause();
    });
  }, [active, ref]);
}
