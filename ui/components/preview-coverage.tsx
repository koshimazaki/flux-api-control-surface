import { sectionColor } from "@/components/camera-presets";
import { cameraSections, type CameraSelection } from "@/lib/camera-language";
import type { PreviewView } from "@/lib/camera-scene";
import { combinationNotes, selectionCoverage, type CoverageRow } from "@/lib/preview-support";

const sectionOf = (row: CoverageRow) => cameraSections.find((section) => section.terms.some((item) => item.id === row.term.id));

function Row({ row, badge }: { row: CoverageRow; badge: string }) {
  const section = sectionOf(row);
  return (
    <li style={section ? sectionColor(section) : undefined}>
      <span className="previewCoverageBadge">{badge}</span>
      <strong>{row.term.label}</strong> {row.support.note}
    </li>
  );
}

/**
 * How far the preview shows each chosen term: the ones it shows, labelled
 * stand-ins, and terms that only shape the prompt. The prompt behaviour is
 * the same either way.
 */
export function PreviewCoverage({ selection, view }: { selection: CameraSelection; view: PreviewView }) {
  const { shown, approximate, promptOnly } = selectionCoverage(selection);
  const notes = combinationNotes(selection);
  if (!shown.length && !approximate.length && !promptOnly.length) {
    return <p className="previewCoverageEmpty">Choose terms to see what the preview shows for each.</p>;
  }
  return (
    <div className="previewCoverage" aria-label="What the preview shows">
      {shown.length > 0 && (
        <p>
          <span className="previewCoverageBadge">Shown</span>
          {shown.map(({ term }) => term.label).join(" · ")}
        </p>
      )}
      {(approximate.length > 0 || promptOnly.length > 0) && (
        <ul>
          {approximate.map((row) => (
            <Row key={row.term.id} row={row} badge="Approximate" />
          ))}
          {promptOnly.map((row) => (
            <Row key={row.term.id} row={row} badge="Prompt only" />
          ))}
        </ul>
      )}
      {notes.map((note) => (
        <p key={note} className="previewCoverageHint">
          <span className="previewCoverageBadge">Together</span>
          {note}
        </p>
      ))}
      {view === "diagram" && <p className="previewCoverageHint">Focus, lens, light and looks show in the shot preview.</p>}
    </div>
  );
}
