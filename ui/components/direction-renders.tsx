import { useEffect, useState } from "react";
import type { CameraSelection } from "@/lib/camera-language";
import type { Flux3VideoResult } from "@/lib/flux3-video";

/** Saved renders that used any of the chosen terms, newest first. */
export function rendersUsing(results: Flux3VideoResult[], selection: CameraSelection) {
  const chosen = new Set(Object.values(selection).filter(Boolean));
  if (!chosen.size) return [];
  return results.filter((result) => Object.values(result.camera?.selection ?? {}).some((id) => id && chosen.has(id)));
}

/**
 * Your FLUX 3 renders made with the same terms, so a choice can be judged by
 * what it actually produced. Hover a clip to play it.
 */
export function DirectionRenders({ selection }: { selection: CameraSelection }) {
  const [results, setResults] = useState<Flux3VideoResult[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bfl/flux3-video", { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()).results as Flux3VideoResult[]) : []))
      .then((items) => {
        if (!cancelled) setResults(items);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = results ? rendersUsing(results, selection).slice(0, 6) : [];
  return (
    <section className="directionRenders" aria-label="Your renders with these terms">
      <span className="directionRendersTitle">Your renders with these terms</span>
      {results === null ? (
        <p>Loading your renders…</p>
      ) : matches.length ? (
        <div className="directionRendersGrid">
          {matches.map((result) => (
            <figure key={result.id} title={result.prompt}>
              <video
                src={result.videoUrl}
                muted
                loop
                playsInline
                preload="metadata"
                onMouseEnter={(event) => void event.currentTarget.play().catch(() => undefined)}
                onMouseLeave={(event) => event.currentTarget.pause()}
              />
              <figcaption>{result.camera?.terms.join(" · ")}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p>None yet. Renders made with these terms show up here.</p>
      )}
    </section>
  );
}
