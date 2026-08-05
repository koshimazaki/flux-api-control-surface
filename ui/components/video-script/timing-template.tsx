import { Clock, Music, RotateCcw } from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import type { VideoScriptTimingMode } from "@/lib/video-script-plan";
import type { AudioMarkerImportKind } from "@/lib/video-script/audio-markers";
import type { VideoScriptEditorRow } from "@/lib/video-script/types";

/**
 * Batch timing template.
 *
 * A timed batch reads as one audio timeline driving many visual permutations:
 * one timestamp pattern applies to every row, and a row can override it through
 * this editor rather than raw per-cell numbers. Timestamps can be imported from
 * the Audio Script's beat, transition, or locked markers.
 */
export type VideoScriptTimingTemplateProps = {
  mode: VideoScriptTimingMode;
  template: number[];
  slotCount: number;
  duration: number | "auto";
  /** Row whose timeline is being overridden, when the matrix opened one. */
  overrideRow?: VideoScriptEditorRow | null;
  /** Null when the Audio Script has no cached markers in this browser. */
  audioAvailable: boolean;
  importNote?: string;
  onModeChange: (mode: VideoScriptTimingMode) => void;
  onTemplateChange: (template: number[]) => void;
  onOverrideChange?: (timing: number[] | undefined) => void;
  onImportMarkers: (kind: AudioMarkerImportKind) => void;
  onResetTemplate: () => void;
};

const IMPORT_KINDS: Array<{ id: AudioMarkerImportKind; label: string }> = [
  { id: "beat", label: "Beats" },
  { id: "transition", label: "Transitions" },
  { id: "locked", label: "Locked" }
];

function TimelineEditor(props: { values: number[]; slotCount: number; onChange: (values: number[]) => void }) {
  return (
    <div className="videoScriptTimeline">
      {Array.from({ length: props.slotCount }, (_, index) => (
        <label key={index}>
          <span>{index + 1}</span>
          <NumberField
            min={0}
            step={0.1}
            value={Number.isFinite(props.values[index]) ? props.values[index] : ""}
            onCommit={(value) => {
              const next = Array.from({ length: props.slotCount }, (_, slot) => props.values[slot] ?? 0);
              next[index] = value;
              props.onChange(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

export function VideoScriptTimingTemplate(props: VideoScriptTimingTemplateProps) {
  const overrideValues = props.overrideRow?.timingOverride;

  return (
    <section className="videoScriptTiming">
      <div className="runLogHeader">
        <span>Timing</span>
        <small>{props.mode === "even" ? "evenly distributed" : "explicit timestamps"}</small>
      </div>

      <div className="videoScriptChoiceRow">
        <button
          type="button"
          className={props.mode === "even" ? "active" : ""}
          onClick={() => props.onModeChange("even")}
        >
          Even
        </button>
        <button
          type="button"
          className={props.mode === "timed" ? "active" : ""}
          onClick={() => props.onModeChange("timed")}
        >
          <Clock size={13} />
          Timed
        </button>
      </div>

      {props.mode === "timed" && (
        <>
          <div className="videoScriptImportRow">
            <span>
              <Music size={13} />
              Import from Audio Script
            </span>
            {IMPORT_KINDS.map((kind) => (
              <button
                key={kind.id}
                type="button"
                onClick={() => props.onImportMarkers(kind.id)}
                disabled={!props.audioAvailable}
                title={
                  props.audioAvailable
                    ? `Map ${kind.label.toLowerCase()} marker times onto ${props.slotCount} keyframes`
                    : "Analyse audio in the Audio tab first; its markers are cached for this import."
                }
              >
                {kind.label}
              </button>
            ))}
            <button type="button" onClick={props.onResetTemplate} title="Rebuild an evenly spaced template">
              <RotateCcw size={12} />
              Even spacing
            </button>
          </div>
          {props.importNote && <small className="videoScriptImportNote">{props.importNote}</small>}

          <TimelineEditor values={props.template} slotCount={props.slotCount} onChange={props.onTemplateChange} />
          <small>
            One template for the whole batch, inside the {String(props.duration)}s duration and strictly increasing.
          </small>

          {props.overrideRow && props.onOverrideChange && (
            <div className="videoScriptOverride">
              <div className="runLogHeader">
                <span>Row timeline override</span>
                <button
                  type="button"
                  onClick={() => props.onOverrideChange?.(undefined)}
                  disabled={!overrideValues}
                >
                  Use batch template
                </button>
              </div>
              <TimelineEditor
                values={overrideValues || props.template}
                slotCount={props.slotCount}
                onChange={(values) => props.onOverrideChange?.(values)}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
