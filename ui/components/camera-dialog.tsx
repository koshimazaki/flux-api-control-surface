import { ArrowUpRight, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { CameraPresetGrid, sectionColor } from "@/components/camera-presets";
import { CameraPreview } from "@/components/camera-preview";
import { DirectionClauses } from "@/components/direction-clauses";
import { DirectionRenders } from "@/components/direction-renders";
import { IconButton } from "@/components/ui/icon-button";
import {
  CAMERA_GUIDE_SECTION_COUNT,
  CAMERA_GUIDE_URL,
  cameraLabel,
  cameraSections,
  type CameraDirection
} from "@/lib/camera-language";

type CameraDialogProps = {
  direction: CameraDirection;
  onApply: (direction: CameraDirection) => void;
  onClose: () => void;
};

/**
 * The expanded view, as in Studio Lite: every section at once, one choice per
 * section, the chosen clauses as editable lines, and a side drawer with the
 * combined 3D preview and your renders that used these terms. Works on a
 * draft, so Cancel leaves the prompt untouched.
 */
export function CameraDialog({ direction, onApply, onClose }: CameraDialogProps) {
  const [draft, setDraft] = useState(direction);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();

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
        <div className={drawerOpen ? "cameraDialogMain withDrawer" : "cameraDialogMain"}>
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
            <section className="cameraDialogClauses">
              <span className="cameraDialogEyebrow">Added to the prompt · type to fine-tune</span>
              <DirectionClauses direction={{ ...draft, enabled: true }} onChange={setDraft} />
            </section>
          </div>
          <aside className={drawerOpen ? "directionDrawer open" : "directionDrawer"}>
            <button
              type="button"
              className="directionDrawerToggle"
              aria-expanded={drawerOpen}
              title={drawerOpen ? "Fold away the preview" : "Show the 3D preview"}
              onClick={() => setDrawerOpen((open) => !open)}
            >
              {drawerOpen ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            </button>
            {drawerOpen && (
              <div className="directionDrawerBody">
                <CameraPreview selection={draft.selection} />
                <DirectionRenders selection={draft.selection} />
              </div>
            )}
          </aside>
        </div>
        <footer className="cameraDialogActions">
          <a href={CAMERA_GUIDE_URL} target="_blank" rel="noopener noreferrer">
            All {CAMERA_GUIDE_SECTION_COUNT} sections of the BFL camera guide
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
