import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PreviewCoverage } from "@/components/preview-coverage";
import { IconButton } from "@/components/ui/icon-button";
import { cameraLabel, type CameraSelection } from "@/lib/camera-language";
import type { PreviewView, createCameraScene } from "@/lib/camera-scene";
import { insetOnLeft } from "@/lib/preview-channels";

type CameraScene = ReturnType<typeof createCameraScene>;

const VIEWS: Array<{ id: PreviewView; label: string; title: string }> = [
  { id: "diagram", label: "Scene diagram", title: "The camera rig and its path around the subject" },
  { id: "shot", label: "Shot preview", title: "What the camera sees, with the scene diagram inset" }
];

/**
 * The combined 3D preview of every chosen term, ported from FLUX Studio Lite.
 * three.js loads only when a preview opens. One canvas lives for the whole
 * drawer: replay, view and selection changes restart the scene on it, a theme
 * change rebuilds the scene on it, and reduced motion shows one still.
 */
export function CameraPreview({ selection }: { selection: CameraSelection }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<CameraScene | null>(null);
  const latest = useRef({ selection, view: "diagram" as PreviewView, reduced: false });
  const [unavailable, setUnavailable] = useState(false);
  const [replay, setReplay] = useState(0);
  const [view, setView] = useState<PreviewView>("diagram");
  const [reduced, setReduced] = useState(false);
  latest.current = { selection, view, reduced };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let create: typeof createCameraScene | null = null;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const build = (rebuild: boolean) => {
      sceneRef.current?.dispose({ keepRenderer: rebuild });
      sceneRef.current = null;
      if (!create || cancelled) return;
      try {
        const scene = create(canvas);
        sceneRef.current = scene;
        scene.setView(latest.current.view);
        scene.play(latest.current.selection, motion.matches);
        setUnavailable(false);
      } catch {
        setUnavailable(true);
      }
    };
    setReduced(motion.matches);
    import("@/lib/camera-scene")
      .then((module) => {
        create = module.createCameraScene;
        build(false);
      })
      .catch(() => setUnavailable(true));
    // Theme colours are read when the scene is built, so a theme switch rebuilds it on the same canvas.
    const root = canvas.closest(".dsgn-root");
    const theme = new MutationObserver(() => build(true));
    if (root) theme.observe(root, { attributes: true, attributeFilter: ["data-surface-theme"] });
    const onMotion = () => setReduced(motion.matches);
    const onVisibility = () => sceneRef.current?.setVisible(!document.hidden);
    const onContextLost = (event: Event) => {
      event.preventDefault();
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setUnavailable(true);
    };
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onContextLost);
    return () => {
      cancelled = true;
      theme.disconnect();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.play(selection, reduced);
  }, [selection, replay, reduced]);

  useEffect(() => {
    sceneRef.current?.setView(view);
  }, [view]);

  const label = cameraLabel(selection);
  return (
    <div className="cameraPreview" data-view={view}>
      <div className="cameraPreviewStage">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Illustrative ${view === "shot" ? "shot" : "scene diagram"}: ${label}`}
          style={{ display: unavailable ? "none" : "block" }}
        />
        {!unavailable && view === "shot" && (
          <button
            type="button"
            className={insetOnLeft(selection) ? "cameraPreviewInset left" : "cameraPreviewInset"}
            title="Show the scene diagram"
            aria-label="Show the scene diagram"
            onClick={() => setView("diagram")}
          />
        )}
        {unavailable && <p className="cameraPreviewFallback">3D preview unavailable. Your direction still applies.</p>}
      </div>
      <div className="cameraPreviewCaption">
        <div className="cameraPreviewViews" role="group" aria-label="Preview view">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-preview-view={item.id}
              aria-pressed={view === item.id}
              className={view === item.id ? "active" : undefined}
              title={item.title}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <IconButton title={reduced ? "Show the still again" : "Replay the preview"} onClick={() => setReplay((value) => value + 1)}>
          <RotateCcw size={14} />
        </IconButton>
      </div>
      <strong className="cameraPreviewLabel">{label}</strong>
      <PreviewCoverage selection={selection} view={view} />
      <small className="cameraPreviewNote">Illustration · results may vary{reduced ? " · reduced motion: one still" : ""}</small>
    </div>
  );
}
