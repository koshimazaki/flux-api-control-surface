import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { cameraLabel, type CameraSelection } from "@/lib/camera-language";
import { selectionPose } from "@/lib/camera-paths";
import type { createCameraScene } from "@/lib/camera-scene";

type CameraScene = ReturnType<typeof createCameraScene>;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The combined 3D preview of every chosen term, ported from FLUX Studio Lite.
 * three.js loads only when a preview opens. Looks such as noir or VHS are CSS
 * filters over the canvas; fades are an overlay timed to the shot.
 */
export function CameraPreview({ selection }: { selection: CameraSelection }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<CameraScene | null>(null);
  const latest = useRef(selection);
  latest.current = selection;
  const [unavailable, setUnavailable] = useState(false);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const visibility = () => sceneRef.current?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    import("@/lib/camera-scene")
      .then(({ createCameraScene }) => {
        if (cancelled || !canvas) return;
        sceneRef.current = createCameraScene(canvas);
        sceneRef.current.play(latest.current, reducedMotion());
      })
      .catch(() => setUnavailable(true));
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visibility);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.play(selection, reducedMotion());
  }, [selection, replay]);

  const pose = selectionPose(selection);
  const duration = pose.speed ? 1600 / pose.speed : 1600;
  return (
    <div
      className={`cameraPreview look-${pose.look ?? "none"}`}
      data-transition={selection.transitions ?? ""}
      style={{ "--shot-ms": `${Math.round(duration + 700)}ms` } as CSSProperties}
      role="img"
      aria-label={`Illustrative preview: ${cameraLabel(selection)}`}
    >
      <div className="cameraPreviewStage" key={replay}>
        <canvas ref={canvasRef} aria-hidden="true" style={{ display: unavailable ? "none" : "block" }} />
        {unavailable && <p className="cameraPreviewFallback">3D preview unavailable. Your direction still applies.</p>}
      </div>
      <div className="cameraPreviewCaption">
        <div>
          <span>Combined preview</span>
          <strong>{cameraLabel(selection)}</strong>
        </div>
        <IconButton title="Replay the preview" onClick={() => setReplay((value) => value + 1)}>
          <RotateCcw size={14} />
        </IconButton>
      </div>
      <small className="cameraPreviewNote">Illustration · results may vary</small>
    </div>
  );
}
