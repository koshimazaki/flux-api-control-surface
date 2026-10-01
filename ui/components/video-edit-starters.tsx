import { ChevronDown, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { VIDEO_EDIT_PROMPT_STARTERS, activeStarterLabels } from "@/lib/video-edit";

type VideoEditStartersProps = {
  prompt: string;
  onToggle: (starterPrompt: string) => void;
};

/**
 * Phrasing shortcuts drawn from BFL's video-editing guide — my addition, not an
 * API feature, so they must not cost the control rail two rows of chips. One
 * trigger collapses them; opening it shows the full grid, and it stays open so
 * several changes can be written in one pass.
 */
export function VideoEditStarters({ prompt, onToggle }: VideoEditStartersProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const applied = activeStarterLabels(prompt);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="videoEditStarters" ref={rootRef}>
      <button
        type="button"
        className="videoEditStartersTrigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <WandSparkles size={13} />
        Phrasing
        {applied.length > 0 && <span className="videoEditStartersCount">{applied.length}</span>}
        <ChevronDown size={13} className="videoEditStartersChevron" />
      </button>
      {open && (
        <div className="videoEditStartersMenu" role="group" aria-label="Prompt phrasing">
          <div className="videoEditStartersMenuLabel">Name one change per pass</div>
          <div className="videoEditStartersGrid">
            {VIDEO_EDIT_PROMPT_STARTERS.map((starter) => {
              const isApplied = applied.includes(starter.label);
              return (
                <button
                  type="button"
                  key={starter.label}
                  className={isApplied ? "active" : undefined}
                  aria-pressed={isApplied}
                  onClick={() => onToggle(starter.prompt)}
                  title={isApplied ? `Remove: ${starter.prompt}` : starter.prompt}
                >
                  {starter.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
