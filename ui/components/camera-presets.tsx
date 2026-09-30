import { RotateCcw } from "lucide-react";
import { useId, type CSSProperties } from "react";
import { CameraGlyph } from "@/components/camera-glyph";
import {
  CAMERA_CLAUSE_MAX_LENGTH,
  sectionTerms,
  type CameraSection,
  type CameraTerm,
  type CameraTermId
} from "@/lib/camera-language";

export function sectionColor(section: CameraSection) {
  return { "--section-color": `var(${section.color})` } as CSSProperties;
}

type CameraPresetGridProps = {
  section: CameraSection;
  selected: CameraTermId | null;
  onSelect: (id: CameraTermId | null) => void;
};

/** None plus a section's eight terms, each with its glyph. One choice per section. */
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
          <CameraGlyph section={section} term={item} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

type CameraClauseFieldProps = {
  section: CameraSection;
  term: CameraTerm;
  value: string;
  /** undefined restores the term's default clause. */
  onChange: (text: string | undefined) => void;
};

/** The editable clause for one chosen term, with its description. */
export function CameraClauseField({ section, term, value, onChange }: CameraClauseFieldProps) {
  const id = useId();
  return (
    <div className="cameraClauseField" style={sectionColor(section)}>
      <div className="cameraClauseHeader">
        <label htmlFor={id}>
          {section.label} · {term.label}
        </label>
        {value !== term.clause && (
          <button type="button" onClick={() => onChange(undefined)} title="Restore the default clause">
            <RotateCcw size={12} />
            Default
          </button>
        )}
      </div>
      <small>{term.description}</small>
      <textarea
        id={id}
        rows={2}
        maxLength={CAMERA_CLAUSE_MAX_LENGTH}
        value={value}
        placeholder="Add camera direction…"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
