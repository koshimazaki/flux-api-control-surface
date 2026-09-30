import {
  Aperture,
  ArrowRightLeft,
  Clapperboard,
  Eye,
  Film,
  Focus,
  Grid3x3,
  Palette,
  Sparkles,
  Sun,
  Timer,
  type LucideIcon
} from "lucide-react";
import type { CSSProperties } from "react";
import { CameraGlyph } from "@/components/camera-glyph";
import { sectionTerms, type CameraSection, type CameraSectionId, type CameraTermId } from "@/lib/camera-language";

export function sectionColor(section: CameraSection) {
  return { "--section-color": `var(${section.color})` } as CSSProperties;
}

/** Icons for the sections without a pose glyph (the camera sections draw their own). */
const sectionIcons: Partial<Record<CameraSectionId, LucideIcon>> = {
  composition: Grid3x3,
  pov: Eye,
  lenses: Aperture,
  focus: Focus,
  shutter: Timer,
  lighting: Sun,
  format: Film,
  "art-direction": Palette,
  animation: Clapperboard,
  vfx: Sparkles,
  transitions: ArrowRightLeft
};

export function SectionMark({ section, termId }: { section: CameraSection; termId: CameraTermId }) {
  const item = sectionTerms(section).find((entry) => entry.id === termId);
  if (section.glyph !== "icon" && item) return <CameraGlyph section={section} term={item} />;
  const Icon = sectionIcons[section.id] ?? Sparkles;
  return <Icon className="cameraGlyph" size={17} aria-hidden="true" />;
}

type CameraPresetGridProps = {
  section: CameraSection;
  selected: CameraTermId | null;
  onSelect: (id: CameraTermId | null) => void;
};

/** None plus a section's terms, each with its glyph or icon. One choice per section. */
export function CameraPresetGrid({ section, selected, onSelect }: CameraPresetGridProps) {
  return (
    <div className="cameraPresetGrid" role="group" aria-label={section.label} style={sectionColor(section)}>
      <button
        type="button"
        className={selected === null ? "cameraPreset cameraPresetNone selected" : "cameraPreset cameraPresetNone"}
        aria-pressed={selected === null}
        title={`No ${section.label.toLowerCase()} clause`}
        onClick={() => onSelect(null)}
      >
        <span className="cameraPresetDash" aria-hidden="true">
          —
        </span>
        <span>None</span>
      </button>
      {sectionTerms(section).map((item) => (
        <button
          key={item.id}
          type="button"
          className={selected === item.id ? "cameraPreset selected" : "cameraPreset"}
          aria-pressed={selected === item.id}
          title={item.description}
          onClick={() => onSelect(item.id)}
        >
          <SectionMark section={section} termId={item.id} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
