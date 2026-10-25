import {
  Blend,
  Box,
  Cctv,
  Cloud,
  CloudFog,
  Contrast,
  Droplets,
  Eclipse,
  Eye,
  Fingerprint,
  Flashlight,
  Gem,
  Moon,
  Paintbrush,
  Palette,
  PenTool,
  Pipette,
  Rocket,
  Route,
  Scissors,
  Snail,
  Sparkles,
  Sun,
  Sunset,
  Zap,
  type LucideIcon
} from "lucide-react";
import type { ReactNode } from "react";
import {
  Band,
  CameraBody,
  Figure,
  STROKE,
  compositionMarks,
  focusMarks,
  lensMarks,
  timeMarks
} from "@/components/direction-mark-parts";
import type { CameraTermId } from "@/lib/camera-language";

/**
 * Term marks for the eleven sections without a pose glyph. Diagrams share the
 * camera glyphs' grammar; recognisable objects come from Lucide, nested in
 * the same 48 x 36 slot at a matching stroke, so every mark reads at one size.
 * Colour is always currentColor: neutral at rest, the section colour when chosen.
 */

/** A 16:9 frame for the format and transition marks. */
const frame = (x: number, y: number, width: number, height: number, extra: Record<string, string | number> = {}) => (
  <rect x={x} y={y} width={width} height={height} rx="1.2" {...extra} />
);

const PIXEL_FIGURE = ["..###..", "..###..", "...#...", ".#####.", "#.###.#", "#.###.#", "..###..", "..#.#..", "..#.#..", ".##.##."];
const pixelPath = PIXEL_FIGURE.flatMap((row, y) =>
  [...row].flatMap((cell, x) => (cell === "#" ? [`M${15.6 + x * 2.4} ${6 + y * 2.4}h2.4v2.4h-2.4z`] : []))
).join("");

const formatMarks: Partial<Record<CameraTermId, ReactNode>> = {
  letterbox: (
    <>
      {frame(5, 6, 38, 24)}
      <path d="M5 6h38v5.5H5zM5 24.5h38V30H5z" fill="currentColor" stroke="none" opacity=".5" />
      <Figure x={24} y={19} s={0.55} />
    </>
  ),
  "film-16mm": (
    <>
      <rect x="12" y="3" width="24" height="30" rx="1" />
      <path d="M14 6h2.4v2.4H14zM14 11.5h2.4v2.4H14zM14 17h2.4v2.4H14zM14 22.5h2.4v2.4H14zM14 28h2.4v2.4H14z" opacity=".7" />
      {frame(19, 5.5, 14, 11)}
      {frame(19, 19.5, 14, 11)}
    </>
  ),
  "super-8": (
    <>
      <circle cx="20" cy="17.5" r="12.5" />
      <circle cx="20" cy="11.3" r="3.2" />
      <circle cx="25.4" cy="20.6" r="3.2" />
      <circle cx="14.6" cy="20.6" r="3.2" />
      <circle cx="20" cy="17.5" r="1.2" />
      <path d="M20 30h20l3-3" />
    </>
  ),
  vhs: (
    <>
      <rect x="6" y="8" width="36" height="21" rx="2" />
      <rect x="17" y="13" width="14" height="7.5" rx="1" />
      <circle cx="13" cy="16.8" r="3" />
      <circle cx="35" cy="16.8" r="3" />
      <path d="M14 29l2-3.5h16l2 3.5" />
    </>
  ),
  "split-screen": (
    <>
      {frame(5, 6, 38, 24)}
      <path d="M24 6v24" />
      <Figure x={14.5} y={19.5} s={0.85} />
      <path d="M26 25h15" opacity=".3" />
      <Figure x={33.5} y={21.2} s={0.42} />
    </>
  ),
  "large-format": (
    <>
      {frame(5, 4, 38, 28)}
      <path d="M5 27l10-9 7 6 8-10 13 13" opacity=".6" />
      {frame(7.5, 21.5, 12, 8, { strokeDasharray: "1.5 1.5" })}
    </>
  )
};

const transitionMarks: Partial<Record<CameraTermId, ReactNode>> = {
  "hard-cut": (
    <>
      {frame(4, 10, 16, 16)}
      <Figure x={12} y={18.5} s={0.5} />
      <path d="M24 6v24" />
      {frame(28, 10, 16, 16)}
      <Figure x={36} y={18.5} s={0.72} />
    </>
  ),
  "match-cut": (
    <>
      {frame(4, 10, 16, 16)}
      <circle cx="10" cy="16" r="3" />
      <path d="M5.5 26q4.5-5.5 9 0" />
      {frame(28, 10, 16, 16)}
      <circle cx="34" cy="16" r="3" />
      <path d="M28 22h16" opacity=".35" />
      <path d="M14 16h15" strokeDasharray="1.5 2" opacity=".5" />
    </>
  ),
  "whip-pan": (
    <>
      {frame(4, 10, 16, 16, { opacity: 0.4 })}
      {frame(28, 10, 16, 16)}
      <path d="M9 15h22M6 18h28M10 21h20" opacity=".55" />
    </>
  ),
  dissolve: (
    <>
      {frame(5, 8, 24, 17)}
      {frame(19, 11, 24, 17, { strokeDasharray: "2 1.6" })}
      <rect x="19" y="11" width="10" height="14" fill="currentColor" stroke="none" opacity=".18" />
    </>
  ),
  "fade-black": (
    <>
      {frame(4, 10, 16, 16)}
      <path d="M21.5 18h5m-2-2 2 2-2 2" />
      {frame(28, 10, 16, 16, { fill: "currentColor", fillOpacity: 0.62 })}
    </>
  ),
  "morph-cut": (
    <>
      <circle cx="10" cy="18" r="6" />
      <rect x="18" y="12" width="12" height="12" rx="4" opacity=".7" />
      <rect x="33" y="12" width="12" height="12" rx=".6" />
    </>
  )
};

const rigMarks: Partial<Record<CameraTermId, ReactNode>> = {
  "body-mount": (
    <>
      <CameraBody x={15} y={13} s={0.6} />
      <path d="M21.5 15 28 17.5" />
      <Figure x={31} y={19} s={1} />
    </>
  ),
  handheld: (
    <>
      <g transform="rotate(-8 24 18)">
        <CameraBody x={23} y={18} s={0.9} />
      </g>
      <path d="M9 11q-3 7 0 14M39 11q3 7 0 14" opacity=".5" />
      <path d="M12.5 14q-1.5 4 0 8M35.5 14q1.5 4 0 8" opacity=".3" />
    </>
  ),
  steadicam: (
    <>
      <CameraBody x={23} y={8.5} s={0.6} />
      <path d="M24 12v12M19 24h10M24 18H12l-3 5" />
      <path d="M31 30h11m-2.5-2.5 2.5 2.5-2.5 2.5" opacity=".6" />
    </>
  ),
  drone: (
    <>
      <circle cx="12" cy="10" r="4.6" />
      <circle cx="36" cy="10" r="4.6" />
      <circle cx="12" cy="26" r="4.6" />
      <circle cx="36" cy="26" r="4.6" />
      <path d="M15.5 13l5 3.5M32.5 13l-5 3.5M15.5 23l5-3.5M32.5 23l-5-3.5" />
      <rect x="20" y="14.5" width="8" height="7" rx="2" />
    </>
  )
};

const effectMarks: Partial<Record<CameraTermId, ReactNode>> = {
  "double-exposure": (
    <>
      <Figure x={20} y={19.5} s={1} />
      <Figure x={27.5} y={17.5} s={1.15} opacity=".42" />
    </>
  ),
  hologram: (
    <>
      <path d="M16.5 30 12 5M31.5 30 36 5" opacity=".28" />
      <Figure x={24} y={17} s={1} strokeDasharray="1.4 1.4" />
      <ellipse cx="24" cy="30" rx="7.5" ry="2" />
    </>
  ),
  glitch: (
    <>
      <Band from={0} to={13}>
        <Figure x={24} y={18} s={1.05} />
      </Band>
      <Band from={13} to={19}>
        <Figure x={27.5} y={18} s={1.05} />
      </Band>
      <Band from={19} to={24}>
        <Figure x={21.5} y={18} s={1.05} />
      </Band>
      <Band from={24} to={36}>
        <Figure x={25} y={18} s={1.05} />
      </Band>
      <path d="M7 15.5h6M35 22h6" opacity=".5" />
    </>
  ),
  disintegrate: (
    <>
      <Figure x={17} y={19} s={1} />
      <g fill="currentColor" stroke="none">
        <circle cx="24.5" cy="13" r=".9" opacity=".9" />
        <circle cx="27.5" cy="17" r=".9" opacity=".8" />
        <circle cx="30" cy="11" r=".9" opacity=".7" />
        <circle cx="33" cy="15" r=".9" opacity=".6" />
        <circle cx="29" cy="22" r=".9" opacity=".6" />
        <circle cx="36.5" cy="10" r=".9" opacity=".45" />
        <circle cx="38" cy="19" r=".9" opacity=".4" />
        <circle cx="41.5" cy="13.5" r=".9" opacity=".3" />
      </g>
    </>
  )
};

const lookMarks: Partial<Record<CameraTermId, ReactNode>> = {
  silhouette: (
    <>
      <circle cx="24" cy="15" r="10.5" opacity=".45" />
      <path d="M4 28h40" opacity=".35" />
      <Figure x={24} y={19} s={1.05} fill="currentColor" />
    </>
  ),
  brutalist: (
    <>
      <path d="M4 30h40" opacity=".35" />
      <path d="M6 30V15h11v15M17 30V8h15v22M32 30V19h10v11" />
      <path d="M21 12h7M21 16h7M21 20h7" opacity=".5" />
    </>
  ),
  "pixel-art": <path d={pixelPath} fill="currentColor" stroke="none" opacity=".9" />
};

const drawnMarks: Partial<Record<CameraTermId, ReactNode>> = {
  ...compositionMarks,
  ...focusMarks,
  ...lensMarks,
  ...timeMarks,
  ...formatMarks,
  ...transitionMarks,
  ...rigMarks,
  ...effectMarks,
  ...lookMarks
};

/** Recognisable objects and effects, one silhouette per meaning within a section. */
const termIcons: Partial<Record<CameraTermId, LucideIcon>> = {
  "slow-motion": Snail,
  hyperlapse: Route,
  "golden-hour": Sunset,
  "blue-hour": Moon,
  backlit: Eclipse,
  "low-key": Flashlight,
  "high-key": Sun,
  neon: Zap,
  overcast: Cloud,
  "first-person": Eye,
  "security-camera": Cctv,
  "particle-field": Sparkles,
  "smoke-reveal": CloudFog,
  "crystal-growth": Gem,
  "liquid-morph": Droplets,
  noir: Contrast,
  pastel: Palette,
  "teal-orange": Blend,
  "colour-accent": Pipette,
  "retro-futurist": Rocket,
  claymation: Fingerprint,
  anime: PenTool,
  watercolour: Paintbrush,
  "paper-cutout": Scissors,
  "cgi-render": Box
};

/** Whether a term has its own mark (diagram or icon); tests hold every non-pose term to this. */
export function hasDirectionMark(termId: CameraTermId) {
  return Boolean(drawnMarks[termId] ?? termIcons[termId]);
}

/** A Lucide icon's 24-unit stroke that lands on the glyphs' 1.4 once nested at 26 units. */
const NESTED_ICON_STROKE = (STROKE * 24) / 26;

export function DirectionMark({ termId }: { termId: CameraTermId }) {
  const Icon = termIcons[termId];
  return (
    <svg
      className="cameraGlyph"
      width="2.625em"
      height="1.969em"
      viewBox="0 0 48 36"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {drawnMarks[termId] ?? (Icon ? <Icon x={11} y={5} size={26} strokeWidth={NESTED_ICON_STROKE} /> : null)}
    </svg>
  );
}
