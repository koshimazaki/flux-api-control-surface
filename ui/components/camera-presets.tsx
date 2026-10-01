import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { CameraGlyph } from "@/components/camera-glyph";
import { DirectionMark } from "@/components/direction-marks";
import { sectionTerms, type CameraSection, type CameraTermId } from "@/lib/camera-language";

export function sectionColor(section: CameraSection) {
  return { "--section-color": `var(${section.color})` } as CSSProperties;
}

/** A term's mark: the pose glyph for shot sizes, angles and movements, its own diagram or icon elsewhere. */
export function SectionMark({ section, termId }: { section: CameraSection; termId: CameraTermId }) {
  const item = sectionTerms(section).find((entry) => entry.id === termId);
  if (section.glyph !== "icon" && item) return <CameraGlyph section={section} term={item} />;
  return <DirectionMark termId={termId} />;
}

type CameraPresetGridProps = {
  section: CameraSection;
  selected: CameraTermId | null;
  onSelect: (id: CameraTermId | null) => void;
};

/**
 * None plus a section's terms, each with its mark. One choice per section.
 * Marks rest neutral and take the section colour when chosen, with a check,
 * so colour is never the only sign of a choice. None stays neutral.
 */
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
          {selected === item.id && <Check className="cameraPresetCheck" size={11} strokeWidth={2.4} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
