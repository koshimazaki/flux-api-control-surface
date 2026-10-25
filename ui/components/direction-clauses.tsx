import { RotateCcw, X } from "lucide-react";
import { sectionColor } from "@/components/camera-presets";
import {
  CAMERA_CLAUSE_MAX_LENGTH,
  cameraClauses,
  withClauseEdit,
  type CameraDirection
} from "@/lib/camera-language";

type DirectionClausesProps = {
  direction: CameraDirection;
  onChange: (direction: CameraDirection) => void;
};

/**
 * The direction clauses as they join the prompt, one editable line per chosen
 * term in its section colour. Editing fine-tunes that term's wording; the
 * arrow restores the default and the cross drops the term.
 */
export function DirectionClauses({ direction, onChange }: DirectionClausesProps) {
  const clauses = direction.enabled ? cameraClauses(direction.selection, direction.edits) : [];
  if (!clauses.length) return null;
  return (
    <div className="cameraClauseStrip" role="group" aria-label="Direction added to the prompt">
      {clauses.map(({ section, term, text }) => (
        <div key={term.id} className="directionClause" style={sectionColor(section)}>
          <textarea
            rows={1}
            value={text}
            maxLength={CAMERA_CLAUSE_MAX_LENGTH}
            placeholder={`${term.label}: empty, adds nothing`}
            aria-label={`${section.label}: ${term.label}`}
            onChange={(event) => onChange({ ...direction, edits: withClauseEdit(direction.edits, term.id, event.target.value) })}
          />
          <span className="directionClauseActions">
            {text !== term.clause && (
              <button
                type="button"
                title="Restore the default wording"
                onClick={() => onChange({ ...direction, edits: withClauseEdit(direction.edits, term.id, undefined) })}
              >
                <RotateCcw size={11} />
              </button>
            )}
            <button
              type="button"
              title={`Remove ${term.label}`}
              onClick={() => onChange({ ...direction, selection: { ...direction.selection, [section.id]: null } })}
            >
              <X size={11} />
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
