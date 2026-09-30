import { ArrowUpRight, Camera, ChevronDown, Maximize2 } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CameraDialog } from "@/components/camera-dialog";
import { CameraPresetGrid, SectionMark, sectionColor } from "@/components/camera-presets";
import { DirectionClauses } from "@/components/direction-clauses";
import { IconButton } from "@/components/ui/icon-button";
import {
  CAMERA_GUIDE_URL,
  cameraLabel,
  cameraSections,
  sectionTerms,
  type CameraDirection,
  type CameraSection,
  type CameraTermId
} from "@/lib/camera-language";

type CameraPanelProps = {
  direction: CameraDirection;
  onChange: (direction: CameraDirection) => void;
};

/**
 * Direction for the FLUX 3 video prompt, ported from FLUX Studio Lite and grown
 * to every section of BFL's camera guide. The chosen clauses read as the tail
 * of the prompt field and are edited in place there; the panel below is
 * collapsed by default, and the expand button opens every section at once in
 * a dialog with the 3D preview.
 */
export function CameraPanel({ direction, onChange }: CameraPanelProps) {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const bodyId = useId();
  const section = cameraSections[activeIndex];
  const activeTerm = sectionTerms(section).find((item) => item.id === direction.selection[section.id]);

  function select(target: CameraSection, id: CameraTermId | null) {
    // Picking a term is a request for camera direction, so it switches the panel on.
    onChange({ ...direction, enabled: id ? true : direction.enabled, selection: { ...direction.selection, [target.id]: id } });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = cameraSections.length;
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index + count - 1) % count,
      Home: 0,
      End: count - 1
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActiveIndex(next);
    tabs.current[next]?.focus();
  }

  return (
    <>
      <DirectionClauses direction={direction} onChange={onChange} />
      <section className={open ? "cameraPanel open" : "cameraPanel"} aria-label="Camera direction">
        <div className="cameraPanelHeader">
          <button
            type="button"
            className="cameraPanelToggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            <Camera size={15} />
            <span className="cameraPanelTitle">Camera</span>
            <span className="cameraPanelSummary">{direction.enabled ? cameraLabel(direction.selection) : "Off"}</span>
            <ChevronDown className="cameraPanelChevron" size={14} />
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={direction.enabled}
            className={direction.enabled ? "cameraSwitch on" : "cameraSwitch"}
            title={direction.enabled ? "Camera clauses are added to the prompt" : "Camera clauses are left out"}
            onClick={() => onChange({ ...direction, enabled: !direction.enabled })}
          >
            <span>{direction.enabled ? "On" : "Off"}</span>
            <i aria-hidden="true" />
          </button>
          <IconButton title="Open all camera controls" aria-haspopup="dialog" onClick={() => setDialogOpen(true)}>
            <Maximize2 size={14} />
          </IconButton>
        </div>
        {open && (
          <div className="cameraPanelBody" id={bodyId}>
            <div className="cameraTabs" role="tablist" aria-label="Camera sections">
              {cameraSections.map((item, index) => {
                const choice = sectionTerms(item).find((entry) => entry.id === direction.selection[item.id]);
                return (
                  <button
                    key={item.id}
                    ref={(element) => {
                      tabs.current[index] = element;
                    }}
                    type="button"
                    role="tab"
                    id={`${bodyId}-tab-${item.id}`}
                    aria-selected={activeIndex === index}
                    aria-controls={`${bodyId}-panel`}
                    tabIndex={activeIndex === index ? 0 : -1}
                    className={activeIndex === index ? "cameraTab active" : "cameraTab"}
                    style={sectionColor(item)}
                    onClick={() => setActiveIndex(index)}
                    onKeyDown={(event) => onTabKeyDown(event, index)}
                  >
                    <span className="cameraTabText">
                      <small>{item.label}</small>
                      <strong>{choice?.label ?? "None"}</strong>
                    </span>
                  </button>
                );
              })}
            </div>
            <div
              className="cameraTabPanel"
              role="tabpanel"
              id={`${bodyId}-panel`}
              aria-labelledby={`${bodyId}-tab-${section.id}`}
              style={sectionColor(section)}
            >
              <CameraPresetGrid
                section={section}
                selected={direction.selection[section.id]}
                onSelect={(id) => select(section, id)}
              />
              {activeTerm ? (
                <p className="cameraHint">
                  <SectionMark section={section} termId={activeTerm.id} />
                  {activeTerm.description} Edit its wording in the lines under the prompt.
                </p>
              ) : (
                <p className="cameraHint">None adds no {section.label.toLowerCase()} clause to the prompt.</p>
              )}
              <a
                className="cameraGuideLink"
                href={`${CAMERA_GUIDE_URL}#${section.anchor}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {section.heading} in the BFL guide
                <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
        )}
      </section>
      {dialogOpen && (
        <CameraDialog
          direction={direction}
          onClose={() => setDialogOpen(false)}
          onApply={(next) => {
            onChange(next);
            setDialogOpen(false);
          }}
        />
      )}
    </>
  );
}
