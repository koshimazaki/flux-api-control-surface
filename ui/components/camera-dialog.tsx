import { ArrowUpRight, Check, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CameraClauseField, CameraPresetGrid, sectionColor } from "@/components/camera-presets";
import { IconButton } from "@/components/ui/icon-button";
import {
  CAMERA_GUIDE_SECTION_COUNT,
  CAMERA_GUIDE_URL,
  cameraClauses,
  cameraLabel,
  cameraSections,
  withClauseEdit,
  type CameraDirection
} from "@/lib/camera-language";

type CameraDialogProps = {
  direction: CameraDirection;
  onApply: (direction: CameraDirection) => void;
  onClose: () => void;
};

/**
 * The expanded camera view: every section at once plus the clause for each
 * chosen term. Works on a draft, so Cancel leaves the prompt untouched.
 */
export function CameraDialog({ direction, onApply, onClose }: CameraDialogProps) {
  const [draft, setDraft] = useState(direction);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const clauses = cameraClauses(draft.selection, draft.edits);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className="cameraDialog"
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cameraDialogInner">
        <header className="cameraDialogHeader">
          <div>
            <h2 id={headingId}>Camera controls</h2>
            <p>Choose any combination. Leave the rest at None.</p>
          </div>
          <IconButton title="Cancel camera changes" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="cameraDialogBody">
          {cameraSections.map((section) => (
            <section key={section.id} className="cameraDialogSection" style={sectionColor(section)}>
              <div className="cameraDialogEyebrow">
                <a href={`${CAMERA_GUIDE_URL}#${section.anchor}`} target="_blank" rel="noopener noreferrer">
                  {section.heading}
                  <ArrowUpRight size={12} />
                </a>
                <span>{section.terms.length} terms · choose one</span>
              </div>
              <CameraPresetGrid
                section={section}
                selected={draft.selection[section.id]}
                onSelect={(id) => setDraft({ ...draft, selection: { ...draft.selection, [section.id]: id } })}
              />
            </section>
          ))}
          {clauses.length > 0 && (
            <div className="cameraDialogClauses" role="group" aria-label="Camera prompt clauses">
              {clauses.map(({ section, term, text }) => (
                <CameraClauseField
                  key={term.id}
                  section={section}
                  term={term}
                  value={text}
                  onChange={(value) => setDraft({ ...draft, edits: withClauseEdit(draft.edits, term.id, value) })}
                />
              ))}
            </div>
          )}
        </div>
        <footer className="cameraDialogActions">
          <a href={CAMERA_GUIDE_URL} target="_blank" rel="noopener noreferrer">
            {cameraSections.length} of {CAMERA_GUIDE_SECTION_COUNT} sections from the BFL guide
            <ArrowUpRight size={12} />
          </a>
          <strong>{cameraLabel(draft.selection)}</strong>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cameraDialogDone" onClick={() => onApply({ ...draft, enabled: true })}>
            <Check size={15} />
            Done
          </button>
        </footer>
      </div>
    </dialog>
  );
}
