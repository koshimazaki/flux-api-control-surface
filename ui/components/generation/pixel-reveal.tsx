import { Component, useEffect, useState, type ReactNode } from "react";
import { generationPattern, type GenerationPatternVariant } from "@/lib/gallery-generations";
import { ShaderField } from "./shader-field";
import type { RevealMedia } from "./media-mosaic";

type RevealProps = {
  id: string; ready: boolean; paused: boolean; onComplete: () => void;
  durationMs?: number; variant?: GenerationPatternVariant;
  revealStyle?: "shader" | "blocks";
  media?: RevealMedia | null;
};

class RevealBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ShaderReveal({ id, ready, paused, durationMs = 1000, variant, revealStyle = "shader", media, onComplete }: RevealProps) {
  const [revealing, setRevealing] = useState(false);
  return (
    <div className="generationShaderStage" data-phase={revealing ? "dissolving" : "waiting"}>
      <ShaderField id={id} ready={ready} paused={paused} durationMs={durationMs} variant={variant} revealStyle={revealStyle} media={media} onReveal={() => setRevealing(true)} onComplete={onComplete} />
    </div>
  );
}

/** Decorative overlay only: result controls are usable as soon as media loads.
 * Unsupported WebGL, decode failures and reduced motion cannot trap the asset. */
export default function PixelReveal({ id, ready, paused, durationMs = 1000, variant, revealStyle = "shader", media, onComplete }: RevealProps) {
  const [reduced, setReduced] = useState(true);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(preference.matches); setHidden(document.hidden); };
    update();
    preference.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      preference.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    // Fallback also covers a lost GL context. No timer runs during the
    // provider's indeterminate wait.
    const timer = window.setTimeout(onComplete, reduced ? 150 : durationMs + 800);
    return () => window.clearTimeout(timer);
  }, [ready, reduced, durationMs, onComplete]);
  const fallback = <div className={`generationStatic${ready ? " dissolving" : ""}`} />;
  return (
    <div className={`generationReveal${ready ? " revealing" : ""}`} aria-hidden="true" data-pattern={generationPattern(id, variant).variant} data-reveal-duration={durationMs} data-reveal-style={revealStyle}>
      {reduced ? fallback : <RevealBoundary fallback={fallback}>
        <ShaderReveal id={id} ready={ready} paused={paused || hidden} durationMs={durationMs} variant={variant} revealStyle={revealStyle} media={media} onComplete={onComplete} />
      </RevealBoundary>}
    </div>
  );
}
