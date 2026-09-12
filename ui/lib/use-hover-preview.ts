import { useRef, type MouseEvent } from "react";

/**
 * Plays a clip while the pointer rests on it and rewinds when it leaves, so a
 * grid of videos can be read without opening each one.
 *
 * Muted, because a browser refuses to autoplay anything else. Playback the
 * viewer started themselves is left alone: only a preview this started is
 * stopped on the way out.
 */
export function useHoverPreview() {
  const startedByHover = useRef(false);

  return {
    onMouseEnter: (event: MouseEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (!video.paused) return;
      video.muted = true;
      startedByHover.current = true;
      void video.play().catch(() => {
        startedByHover.current = false;
      });
    },
    onMouseLeave: (event: MouseEvent<HTMLVideoElement>) => {
      if (!startedByHover.current) return;
      const video = event.currentTarget;
      video.pause();
      video.currentTime = 0;
      startedByHover.current = false;
    }
  };
}
