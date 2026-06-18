"use client";

import { Download, RotateCcw, Save, Wand2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { displaySize, fitScale } from "@/lib/canvas-geometry";
import { assetImageSource } from "@/lib/dashboard-tools";
import { clampRectToBounds, isUsableSelection, normalizeSelection, targetSizeFor, type Rect } from "@/lib/glyph-geometry";
import { composeGlyphPng, cropImageRegion, downloadSvg, loadImage, vectorizeCanvas } from "@/lib/glyph-vectorize";
import { useElementSize } from "@/lib/use-element-size";
import type { AssetRecord } from "@/lib/types";

export type GlyphSavePayload = {
  pngDataUrl: string;
  svg: string;
  width: number;
  height: number;
  sourceAsset: AssetRecord;
};

type GlyphLabProps = {
  sourceAsset: AssetRecord;
  onSave: (payload: GlyphSavePayload) => Promise<void> | void;
};

export function GlyphLab({ sourceAsset, onSave }: GlyphLabProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [result, setResult] = useState<{ svg: string; width: number; height: number } | null>(null);
  const [colors, setColors] = useState(8);
  const [minArea, setMinArea] = useState(8);
  const [knockout, setKnockout] = useState(true);
  const [targetMode, setTargetMode] = useState<"square" | "native">("square");
  const [status, setStatus] = useState<"idle" | "tracing" | "saving">("idle");
  const [error, setError] = useState("");

  const src = assetImageSource(sourceAsset);
  const stageSize = useElementSize(stageRef);

  useEffect(() => {
    let cancelled = false;
    setSelection(null);
    setResult(null);
    setError("");
    imageRef.current = null;
    setNaturalSize(null);
    loadImage(src)
      .then((image) => {
        if (cancelled) return;
        imageRef.current = image;
        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the source image.");
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const fit = naturalSize ? fitScale(naturalSize, stageSize) : 0;
  const display = naturalSize ? displaySize(naturalSize, fit, 1) : { width: 0, height: 0 };

  function pointToNatural(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const box = boxRef.current;
    if (!box || !naturalSize) return null;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * naturalSize.width,
      y: ((event.clientY - rect.top) / rect.height) * naturalSize.height
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const point = pointToNatural(event);
    if (!point || !naturalSize) return;
    dragStart.current = point;
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !naturalSize) return;
    const point = pointToNatural(event);
    if (!point) return;
    const raw = normalizeSelection(dragStart.current.x, dragStart.current.y, point.x, point.y);
    setSelection(clampRectToBounds(raw, naturalSize.width, naturalSize.height));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function selectAll() {
    if (!naturalSize) return;
    setSelection({ x: 0, y: 0, width: naturalSize.width, height: naturalSize.height });
  }

  async function runVectorize() {
    if (!imageRef.current || !isUsableSelection(selection)) {
      setError("Drag a box over the icon to select it first.");
      return;
    }
    setStatus("tracing");
    setError("");
    try {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const crop = cropImageRegion(imageRef.current, selection);
      const svg = vectorizeCanvas(crop, { colors, minArea, knockoutBackground: knockout });
      if (!svg) throw new Error("empty");
      setResult({ svg, width: crop.width, height: crop.height });
    } catch {
      setError("Vectorize failed — try a different selection or fewer colors.");
    } finally {
      setStatus("idle");
    }
  }

  async function save() {
    if (!result) return;
    setStatus("saving");
    setError("");
    try {
      const target = targetSizeFor(targetMode, { x: 0, y: 0, width: result.width, height: result.height });
      const pngDataUrl = await composeGlyphPng(result.svg, result.width, result.height, target);
      await onSave({ pngDataUrl, svg: result.svg, width: target.width, height: target.height, sourceAsset });
    } catch {
      setError("Could not save the glyph.");
    } finally {
      setStatus("idle");
    }
  }

  const resultSrc = result ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}` : "";
  const hasSelection = isUsableSelection(selection);
  const busy = status !== "idle";

  return (
    <div className="glyphLab">
      <div className="glyphStage" ref={stageRef}>
        {naturalSize && (
          <div
            className="glyphImageBox"
            ref={boxRef}
            style={{ width: display.width || undefined, height: display.height || undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={sourceAsset.title || sourceAsset.id} draggable={false} />
            {selection && (
              <div
                className="glyphMarquee"
                style={{
                  left: selection.x * fit,
                  top: selection.y * fit,
                  width: selection.width * fit,
                  height: selection.height * fit
                }}
              />
            )}
          </div>
        )}
        <small className="maskPaintHint">drag to select an icon · then vectorize</small>
      </div>

      <div className="glyphPanel">
        <div className="glyphResult" aria-label="Vector preview">
          {result ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={resultSrc} alt="Vectorized glyph" />
          ) : (
            <span>{status === "tracing" ? "Tracing…" : "Vector preview"}</span>
          )}
        </div>

        <label className="glyphField">
          Colors · {colors}
          <input type="range" min={2} max={32} value={colors} onChange={(event) => setColors(Number(event.target.value))} />
        </label>
        <label className="glyphField">
          Despeckle · {minArea}px²
          <input type="range" min={0} max={40} value={minArea} onChange={(event) => setMinArea(Number(event.target.value))} />
        </label>
        <label className="glyphCheck">
          <input type="checkbox" checked={knockout} onChange={(event) => setKnockout(event.target.checked)} />
          Cut background (knock out the corner color)
        </label>
        <label className="glyphField">
          Place on
          <select value={targetMode} onChange={(event) => setTargetMode(event.target.value === "native" ? "native" : "square")}>
            <option value="square">1024 × 1024</option>
            <option value="native">Native ({selection ? `${selection.width}×${selection.height}` : "selection"})</option>
          </select>
        </label>

        <div className="glyphButtons">
          <button type="button" onClick={selectAll} disabled={!naturalSize || busy}>
            Select all
          </button>
          <button type="button" className="primary" onClick={() => void runVectorize()} disabled={!hasSelection || busy}>
            <Wand2 size={15} />
            {status === "tracing" ? "Tracing…" : "Vectorize"}
          </button>
        </div>
        <div className="glyphButtons">
          <button type="button" onClick={() => void save()} disabled={!result || busy}>
            <Save size={15} />
            {status === "saving" ? "Saving…" : "Save to library"}
          </button>
          <button type="button" onClick={() => result && downloadSvg(result.svg, `glyph-${sourceAsset.id}`)} disabled={!result || busy}>
            <Download size={15} />
            SVG
          </button>
          <button type="button" onClick={() => setSelection(null)} disabled={!selection || busy} title="Clear selection">
            <RotateCcw size={15} />
          </button>
        </div>
        {error && <p className="errorText">{error}</p>}
      </div>
    </div>
  );
}
