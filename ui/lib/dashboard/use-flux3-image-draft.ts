import { useEffect, useState } from "react";
import {
  clampFuzz,
  type Flux3ImageBox,
  type Flux3ImageMode,
  type Flux3ImageSelection
} from "@/lib/flux3-image";

export const FLUX3_IMAGE_DRAFT_KEY = "bfl-flux3-image-draft";

export type Flux3ImageDraft = {
  mode: Flux3ImageMode;
  selection: Flux3ImageSelection;
  /** Pixel selections paint with a brush or fill a lasso outline. */
  pixelTool: "brush" | "lasso";
  prompts: Record<"t2i" | "edit" | "pixels", string>;
  /** Boxes are in source pixels, so they belong to one source image. */
  boxes: Flux3ImageBox[];
  boxSourceId: string | null;
};

export const defaultFlux3ImageDraft: Flux3ImageDraft = {
  mode: "t2i",
  selection: "boxes",
  pixelTool: "brush",
  prompts: { t2i: "", edit: "", pixels: "" },
  boxes: [],
  boxSourceId: null
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeBox(value: unknown): Flux3ImageBox | null {
  const box = asRecord(value);
  const numbers = [box.x, box.y, box.width, box.height].map(Number);
  if (typeof box.id !== "string" || numbers.some((entry) => !Number.isFinite(entry) || entry < 0)) return null;
  const [x, y, width, height] = numbers.map(Math.round);
  return { id: box.id, x, y, width, height, fuzz: clampFuzz(Number(box.fuzz)), prompt: asText(box.prompt) };
}

export function normalizeFlux3ImageDraft(value: unknown): Flux3ImageDraft {
  const record = asRecord(value);
  const prompts = asRecord(record.prompts);
  return {
    mode: record.mode === "edit" || record.mode === "precise" ? record.mode : "t2i",
    selection: record.selection === "pixels" ? "pixels" : "boxes",
    pixelTool: record.pixelTool === "lasso" ? "lasso" : "brush",
    prompts: { t2i: asText(prompts.t2i), edit: asText(prompts.edit), pixels: asText(prompts.pixels) },
    boxes: Array.isArray(record.boxes) ? record.boxes.map(normalizeBox).filter((box): box is Flux3ImageBox => !!box) : [],
    boxSourceId: typeof record.boxSourceId === "string" ? record.boxSourceId : null
  };
}

/** FLUX 3 Image workspace state, kept in local storage so it survives tab switches. */
export function useFlux3ImageDraft(sourceId: string | null) {
  const [draft, setDraft] = useState<Flux3ImageDraft>(defaultFlux3ImageDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setDraft(normalizeFlux3ImageDraft(JSON.parse(localStorage.getItem(FLUX3_IMAGE_DRAFT_KEY) || "null")));
    } catch {
      /* keep the default draft */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(FLUX3_IMAGE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* the draft cache is non-critical */
    }
  }, [draft, hydrated]);

  // A new source image invalidates boxes drawn in the old one's pixels.
  useEffect(() => {
    if (!hydrated) return;
    setDraft((current) =>
      current.boxSourceId === sourceId ? current : { ...current, boxes: [], boxSourceId: sourceId }
    );
  }, [hydrated, sourceId]);

  function update(patch: Partial<Flux3ImageDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return { draft, update, setDraft };
}
