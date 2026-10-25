import type { ReactNode, SVGProps } from "react";
import type { CameraTermId } from "@/lib/camera-language";

/**
 * Drawing parts for the Visual direction marks, in the grammar of the camera
 * glyphs (`camera-glyph.tsx`): a 48 x 36 box, 1.4 strokes, round joins, the
 * same small figure, frame corners and camera body. Composition, focus, lens
 * and time marks are drawn here; the rest live in `direction-marks.tsx`.
 */
export const STROKE = 1.4;
export const FRAME_CORNERS = "M5 12V5h9m20 0h9v7M5 24v7h9m20 0h9v-7";
const FIGURE_BODY = "M-4 4v-6q4-3 8 0v6M-2 4v5m4-5v5";

type GroupProps = SVGProps<SVGGElement>;

/** The camera glyphs' figure: head at y - 6, feet at y + 9. Stroke stays 1.4 at any scale. */
export function Figure({ x, y, s = 1, ...rest }: { x: number; y: number; s?: number } & GroupProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeWidth={STROKE / s} {...rest}>
      <circle cy="-6" r="2.5" />
      <path d={FIGURE_BODY} />
    </g>
  );
}

/** The movement glyphs' camera body, lens to the right, at any position and scale. */
export function CameraBody({ x, y, s = 1, ...rest }: { x: number; y: number; s?: number } & GroupProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} strokeWidth={STROKE / s} {...rest}>
      <rect x="-5.5" y="-5" width="11" height="10" rx="2" />
      <path d="m5.5-2 6-3v10l-6-3M-2.5-5v-3h5v3" />
    </g>
  );
}

/** A band of the mark, clipped without ids, so the same figure can be sliced. */
export function Band({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  return (
    <svg x="0" y={from} width="48" height={to - from} viewBox={`0 ${from} 48 ${to - from}`} overflow="hidden">
      {children}
    </svg>
  );
}

/** Field of view drawn from the lens: a wide fan for 14mm, a near-closed wedge for telephoto. */
export function LensFan({ fov, apex = [17, 18] as const, opacity }: { fov: number; apex?: readonly [number, number]; opacity?: number }) {
  const half = (Math.min(fov, 100) * Math.PI) / 360;
  const [ax, ay] = apex;
  // Run to the right edge, or to the top and bottom edges for wide lenses.
  const reach = Math.min((46 - ax) / Math.cos(half), 15 / Math.max(Math.sin(half), 0.001));
  const dx = Math.cos(half) * reach;
  const dy = Math.sin(half) * reach;
  const radius = reach * 0.72;
  const arc = `M${ax + Math.cos(half) * radius} ${ay - Math.sin(half) * radius}A${radius} ${radius} 0 0 1 ${ax + Math.cos(half) * radius} ${ay + Math.sin(half) * radius}`;
  return (
    <g opacity={opacity}>
      <path d={`M${ax} ${ay}l${dx} ${-dy}M${ax} ${ay}l${dx} ${dy}`} />
      <path d={arc} opacity=".45" />
    </g>
  );
}

function SmallCamera() {
  return (
    <g>
      <rect x="3" y="14" width="9" height="8" rx="1.5" />
      <path d="M12 16.5h3v3h-3M5.5 14v-2h4v2" />
    </g>
  );
}

const lens = (fov: number) => (
  <>
    <SmallCamera />
    <LensFan fov={fov} />
  </>
);

/** Composition: where the subject sits in the frame. */
export const compositionMarks: Partial<Record<CameraTermId, ReactNode>> = {
  "rule-of-thirds": (
    <>
      <path d={FRAME_CORNERS} />
      <path d="M17.7 7v22M30.3 7v22M7 13.7h34M7 22.3h34" opacity=".3" />
      <Figure x={17.7} y={19.4} s={0.9} />
    </>
  ),
  centered: (
    <>
      <path d={FRAME_CORNERS} />
      <path d="M10 29V15l3-2 3 2v14M38 29V15l-3-2-3 2v14" opacity=".5" />
      <Figure x={24} y={19.5} s={0.9} />
    </>
  ),
  "leading-lines": (
    <>
      <path d={FRAME_CORNERS} />
      <path d="M7 31 22 21.5M41 31 26 21.5M16.5 31l6-9.5M31.5 31l-6-9.5" opacity=".55" />
      <Figure x={24} y={16} s={0.55} />
    </>
  ),
  "frame-within-frame": (
    <>
      <path d={FRAME_CORNERS} />
      <path d="M15.5 31V8.5h17V31" />
      <path d="M18.5 31V11.5h11V31" opacity=".4" />
      <Figure x={24} y={20.5} s={0.68} />
    </>
  ),
  "negative-space": (
    <>
      <path d={FRAME_CORNERS} />
      <path d="M8 27.5h32" opacity=".25" />
      <Figure x={34} y={24} s={0.42} />
    </>
  ),
  "over-the-shoulder": (
    <>
      <path d={FRAME_CORNERS} />
      <svg x="5" y="5" width="38" height="26" viewBox="5 5 38 26" overflow="hidden">
        <circle cx="11.5" cy="18" r="5.5" />
        <path d="M-1 33q2-9 12.5-9T24 33" />
      </svg>
      <Figure x={31} y={18} s={0.85} />
    </>
  )
};

/** Focus: which planes are sharp. Soft strokes stand for out-of-focus planes. */
export const focusMarks: Partial<Record<CameraTermId, ReactNode>> = {
  "shallow-focus": (
    <>
      <circle cx="33.5" cy="11" r="3.4" opacity=".4" />
      <circle cx="40" cy="19.5" r="2.4" opacity=".32" />
      <circle cx="32" cy="25" r="2" opacity=".28" />
      <circle cx="8.5" cy="10" r="2.2" opacity=".28" />
      <Figure x={20} y={19} s={0.95} />
    </>
  ),
  "deep-focus": (
    <>
      <path d="M4 28h40" opacity=".35" />
      <Figure x={12.5} y={18.5} s={1} />
      <Figure x={29} y={21.5} s={0.6} />
      <Figure x={39.5} y={23.5} s={0.4} />
    </>
  ),
  "rack-focus": (
    <>
      <Figure x={13} y={20} s={1} opacity=".35" strokeDasharray="1.6 1.8" />
      <Figure x={34} y={22} s={0.62} />
      <path d="M13.5 7.5q10.5-5 20.5 0m-3-2.6 3 2.6-3.6 1" />
    </>
  ),
  "soft-focus": (
    <>
      <Figure x={24} y={19.5} s={1.36} opacity=".3" />
      <circle cx="24" cy="13.8" r="5.4" opacity=".24" />
      <Figure x={24} y={19.5} s={0.95} />
    </>
  ),
  "tilt-shift": (
    <>
      <path d="M4 14h40M4 22h40" opacity=".5" />
      <path d="M10 21v-3l2.5-2 2.5 2v3M31 21v-4h5v4" />
      <Figure x={23.5} y={18.4} s={0.3} />
      <path d="M6 8h11M23 8h14M9 28h13M28 28h12" opacity=".3" strokeDasharray="1 2.6" />
    </>
  ),
  "split-diopter": (
    <>
      <path d="M24 4v28" strokeDasharray="2 2.2" opacity=".5" />
      <circle cx="12.5" cy="15" r="4.6" />
      <path d="M4.5 31q1-8.5 8-8.5t8 8.5" />
      <Figure x={34.5} y={20} s={0.58} />
    </>
  )
};

/** Lenses: the field of view each focal length sees, drawn from its own `fov`. */
export const lensMarks: Partial<Record<CameraTermId, ReactNode>> = {
  "lens-14mm": lens(81),
  "lens-24mm": lens(53),
  "lens-35mm": lens(38),
  "lens-50mm": lens(27),
  "lens-85mm": lens(16),
  telephoto: lens(7),
  fisheye: (
    <>
      <SmallCamera />
      <circle cx="31" cy="18" r="12" />
      <path d="M31 6q-8 12 0 24M31 6q8 12 0 24M19 18q12-7 24 0M19 18q12 7 24 0" opacity=".5" />
    </>
  ),
  anamorphic: (
    <>
      <SmallCamera />
      <LensFan fov={34} opacity={0.35} />
      <ellipse cx="32" cy="18" rx="6.5" ry="3" />
      <path d="M19 18h7m12 0h7" opacity=".6" />
    </>
  )
};

/** Shutter and time: how time is stretched, sped up or stopped. */
export const timeMarks: Partial<Record<CameraTermId, ReactNode>> = {
  timelapse: (
    <>
      <path d="M4 28h40" opacity=".35" />
      <path d="M7 28q17-30 34 0" opacity=".35" strokeDasharray="1.6 2.2" />
      <circle cx="11.5" cy="19" r="2" opacity=".45" />
      <circle cx="24" cy="10.5" r="2.6" opacity=".7" />
      <circle cx="36.5" cy="19" r="3.2" />
    </>
  ),
  "motion-blur": (
    <>
      <path d="M7 12h13M4 17h17M8 22h12M6 27h14" opacity=".42" />
      <Figure x={31} y={19} s={1} />
    </>
  ),
  "freeze-frame": (
    <>
      <path d={FRAME_CORNERS} />
      <Figure x={19.5} y={19.5} s={0.9} />
      <path d="M30.5 13v7.5M34.5 13v7.5" />
    </>
  ),
  "speed-ramp": (
    <>
      <path d="M5 31h38M5 31V5" opacity=".3" />
      <path d="M7 27c10 0 13-1 17-5s7-14 19-16" />
      <circle cx="7" cy="27" r="1.2" />
      <circle cx="43" cy="6" r="1.2" />
    </>
  )
};
