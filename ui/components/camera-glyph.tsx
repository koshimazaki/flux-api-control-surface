import type { CameraSection, CameraTerm } from "@/lib/camera-language";

function angleGlyphPosition(elevation = 0) {
  const angle = (elevation * Math.PI) / 180;
  return { x: 27 - Math.cos(angle) * 19, y: 18 - Math.sin(angle) * 14, rotation: elevation };
}

function framingGlyph(term: CameraTerm) {
  if (term.id === "macro") return { scale: 5, y: 42 };
  if (term.id === "extreme-close-up") return { scale: 2.7, y: 28 };
  if (term.id === "close-up") return { scale: 1.9, y: 23 };
  return { scale: Math.min(1.5, 2.7 / (term.pose.distance ?? 2.7)), y: 18 };
}

/**
 * Three parametric glyphs (framing, angle, movement) drawn from each term's
 * pose, ported from FLUX Studio Lite. Illustrative, not a lens model.
 */
export function CameraGlyph({ section, term }: { section: CameraSection; term: CameraTerm }) {
  const { elevation = 0, roll = 0, motion, amount = 0 } = term.pose;
  const camera = angleGlyphPosition(elevation);
  const framing = framingGlyph(term);
  return (
    <svg
      className="cameraGlyph"
      width="2.625em"
      height="1.969em"
      viewBox="0 0 48 36"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {section.glyph === "frame" ? (
        <>
          <path d="M5 12V5h9m20 0h9v7M5 24v7h9m20 0h9v-7" />
          <svg x="5" y="5" width="38" height="26" viewBox="5 5 38 26" overflow="hidden">
            <g transform={`translate(24 ${framing.y}) scale(${framing.scale})`}>
              <circle cy="-6" r="2.5" />
              <path d="M-4 4v-6q4-3 8 0v6M-2 4v5m4-5v5" />
            </g>
          </svg>
        </>
      ) : section.glyph === "angle" ? (
        <g transform={`rotate(${roll} 27 18)`}>
          <path d="M4 32h40" opacity=".3" />
          <g>
            <circle cx="27" cy="14" r="2.5" />
            <path d="M23 24v-5q4-3 8 0v5M25 24v6m4-6v6" />
            {term.id === "profile" && <path d="m29 13 2 2-2 1" />}
          </g>
          <path d={`M${camera.x} ${camera.y}L27 18`} strokeDasharray="2 3" opacity=".5" />
          <g transform={`translate(${camera.x} ${camera.y}) rotate(${camera.rotation})`}>
            <rect x="-4" y="-3" width="7" height="6" rx="1" />
            <path d="m3-2 3-1v6L3 2M-2-3v-2h3v2" />
          </g>
        </g>
      ) : (
        <>
          <rect x="18" y="13" width="11" height="10" rx="2" />
          <path d="m29 16 6-3v10l-6-3M21 13v-3h5v3" />
          {motion === "orbit" || motion === "arc" || motion === "subject" ? (
            <path d="M8 17C8 3 40 3 40 18S8 32 8 23m0 0-3 4m3-4 5 1" strokeDasharray={amount < 360 ? "18 4" : undefined} />
          ) : (
            <g transform={`rotate(${motion === "tilt" || motion === "crane" ? -90 : 0} 24 18)`}>
              <path d="M6 29h34m-4-4 4 4-4 4" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}
