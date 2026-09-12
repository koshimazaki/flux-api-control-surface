import { useEffect, useRef } from "react";
import {
  PRESETS, createInstance, createReveal, destroyInstance,
  setFrameRate, setInstancePaused, setInstanceVisible, updateInstanceSize,
  type Instance, type PresetMode
} from "img-fx";
import { generationPattern, type GenerationPatternVariant } from "@/lib/gallery-generations";
import { applyBlockReveal, applyRevealMask, drawGradientField } from "./dither-field";
import { paintMediaMosaic, type RevealMedia } from "./media-mosaic";

function galleryPreset(name: ReturnType<typeof generationPattern>["preset"]): PresetMode {
  const base = PRESETS[name].modes.dark;
  return {
    ...base,
    speed: base.speed * (name === "sweep-gradient" ? 0.18 : 0.45),
    flicker: 0.18,
    colors: name === "pixels-organic"
      ? ["#151718", "#70787b", "#e4eaeb", "#151718", "#f4f6f7", "#151718", "#41484b"]
      : name === "pixels-mechanic"
        ? ["#cad1d4", "#242a2c", "#303a3e", "#545e62", "#080b0c", "#050708", "#20282b"]
        : base.colors,
    vignette: name === "sweep-gradient" ? 0 : 0.12,
    vigOpacity: name === "sweep-gradient" ? 0 : 0.65,
    pixelConfig: { ...base.pixelConfig, hlScale: 0.95, fillOpacity: name === "pixels-mechanic" ? 0.4 : 0.6, edgeFade: 8, fadeStr: 0.35 }
  };
}

/** Use the library's public engine API so each instance owns its speed,
 * contrast without mutating the shared stock presets. */
export function ShaderField({ id, ready, paused, durationMs, variant, revealStyle, media, onReveal, onComplete }: {
  id: string; ready: boolean; paused: boolean; onReveal: () => void; onComplete: () => void;
  durationMs: number; variant?: GenerationPatternVariant;
  revealStyle: "shader" | "blocks";
  media?: RevealMedia | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const shaderCanvas = useRef<HTMLCanvasElement>(null);
  const mosaicCanvas = useRef<HTMLCanvasElement>(null);
  const instance = useRef<Instance | null>(null);
  const sourceReady = useRef(ready);
  sourceReady.current = ready;
  const sourceMedia = useRef(media);
  sourceMedia.current = media;
  const callbacks = useRef({ onReveal, onComplete });
  callbacks.current = { onReveal, onComplete };

  useEffect(() => {
    if (!root.current || !shaderCanvas.current) return;
    const element = root.current;
    const box = element.getBoundingClientRect();
    const pattern = generationPattern(id, variant);
    const preset = galleryPreset(pattern.preset);
    const scale = pattern.pixelScale * (revealStyle === "blocks" ? 1.2 : 0.7);
    setFrameRate(30);
    const inst = createInstance({ canvas: shaderCanvas.current, cssWidth: box.width, cssHeight: box.height,
      preset, pixelScale: scale });
    // The engine's public frame hook stays on the shared, visibility-aware
    // renderer. The actual image/video is already decoded underneath this mask.
    const reveal = createReveal({ canvas: document.createElement("canvas"), shaderCanvas: shaderCanvas.current, cssWidth: box.width, cssHeight: box.height });
    inst.reveal = reveal;
    instance.current = inst;
    const initialTime = inst.accumulatedTime;
    const sample = document.createElement("canvas");
    const mosaic = mosaicCanvas.current;
    const mosaicContext = mosaic?.getContext("2d");
    let revealStartedAt: number | null = null;
    let completed = false;
    reveal.afterShaderFrame = (_renderer, current) => {
      // Keep the approved small cells fixed throughout the wait and reveal.
      // Active renderer time freezes offscreen and while paused.
      const elapsed = current.accumulatedTime - initialTime;
      if (pattern.variant === "sweep") drawGradientField(current.ctx, current.canvas.width, current.canvas.height, elapsed + (pattern.seed % 1000) / 20, scale);
      if (sourceReady.current && revealStartedAt === null) {
        revealStartedAt = current.accumulatedTime;
        callbacks.current.onReveal();
      }
      const arrival = revealStartedAt === null ? 0 : Math.min(1, (current.accumulatedTime - revealStartedAt) / (durationMs / 1000));
      // Keep the same moving shader, using its existing dark/light blocks as
      // transparency. Completion only advances that mask until it clears.
      if (revealStartedAt !== null) {
        const density = (6 + preset.pixelConfig.cellSize * 74) / scale / 320;
        const cell = Math.max(2, Math.min(current.canvas.width, current.canvas.height) / 26 * scale);
        if (revealStyle === "blocks") {
          applyBlockReveal(current.ctx, current.canvas.width, current.canvas.height, arrival, {
            cellWidth: pattern.variant === "sweep" ? cell : current.canvas.width / Math.max(2, Math.floor(current.cssWidth * density)),
            cellHeight: pattern.variant === "sweep" ? cell : current.canvas.height / Math.max(2, Math.floor(current.cssHeight * density)),
            seed: pattern.seed
          });
        } else applyRevealMask(current.ctx, current.canvas.width, current.canvas.height, arrival,
          pattern.variant === "sweep" ? { seed: pattern.seed, grain: Math.max(1, current.canvasDpr * 1.25) } : undefined);
        if (mosaic && mosaicContext && sourceMedia.current) {
          const columns = pattern.variant === "sweep" ? Math.ceil(current.canvas.width / cell) : Math.max(2, Math.floor(current.cssWidth * density));
          const rows = pattern.variant === "sweep" ? Math.ceil(current.canvas.height / cell) : Math.max(2, Math.floor(current.cssHeight * density));
          try {
            const painted = paintMediaMosaic(mosaicContext, sample, current.canvas, sourceMedia.current, columns, rows, arrival, revealStyle === "blocks");
            mosaic.style.opacity = painted ? "1" : "0";
            current.canvas.style.opacity = painted ? "0" : "1";
          } catch {
            mosaic.style.opacity = "0";
            current.canvas.style.opacity = "1";
          }
        }
      }
      if (arrival >= 1 && !completed) { completed = true; callbacks.current.onComplete(); }
    };
    const resize = new ResizeObserver(([entry]) => updateInstanceSize(inst, entry.contentRect.width, entry.contentRect.height));
    const observer = new IntersectionObserver(([entry]) => setInstanceVisible(inst, entry.isIntersecting));
    resize.observe(element);
    observer.observe(element);
    return () => {
      resize.disconnect(); observer.disconnect(); destroyInstance(inst);
      sample.width = sample.height = 0;
      instance.current = null;
    };
  }, [id, durationMs, variant, revealStyle]);
  useEffect(() => {
    if (instance.current) setInstancePaused(instance.current, paused);
  }, [paused]);
  return <div className="generationShader" ref={root}>
    <canvas ref={shaderCanvas} className="generationShaderCanvas" aria-hidden="true" />
    <canvas ref={mosaicCanvas} className="generationMosaicCanvas" aria-hidden="true" />
  </div>;
}
