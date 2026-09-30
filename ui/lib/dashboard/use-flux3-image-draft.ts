import { useEffect, useState } from "react";
import {
  FLUX3_IMAGE_MAX_REFERENCES,
  clampFuzz,
  type Flux3ImageMode,
  type Flux3ImageRegion,
  type RegionPoint
} from "@/lib/flux3-image";

export const FLUX3_IMAGE_DRAFT_KEY = "bfl-flux3-image-draft";

export type Flux3ImageDraft = {
  mode: Flux3ImageMode;
  /** Edit paints an inpaint mask with a brush, a lasso or the eraser. */
  editTool: "brush" | "lasso" | "eraser";
  /** Precise draws each region as a box, a brush stroke or a lasso. */
  regionTool: "box" | "brush" | "lasso";
  prompts: Record<"t2i" | "i2i" | "edit", string>;
  /** Image to image: asset ids per reference slot, null when empty. */
  references: (string | null)[];
  /** Regions are in source pixels, so they belong to one source image. */
  regions: Flux3ImageRegion[];
  regionSourceId: string | null;
};

export const defaultFlux3ImageDraft: Flux3ImageDraft = {
  mode: "t2i",
  editTool: "brush",
  regionTool: "box",
  prompts: { t2i: "", i2i: "", edit: "" },
  references: Array.from({ length: FLUX3_IMAGE_MAX_REFERENCES }, () => null),
  regions: [],
  regionSourceId: null
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizePaths(value: unknown): RegionPoint[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const paths = value
    .filter(Array.isArray)
    .map((path) =>
      (path as unknown[]).filter(
        (point): point is RegionPoint =>
          Array.isArray(point) && point.length === 2 && point.every((entry) => Number.isFinite(entry))
      )
    )
    .filter((path) => path.length);
  return paths.length ? paths : undefined;
}

function normalizeRegion(value: unknown): Flux3ImageRegion | null {
  const region = asRecord(value);
  const numbers = [region.x, region.y, region.width, region.height].map(Number);
  if (typeof region.id !== "string" || numbers.some((entry) => !Number.isFinite(entry) || entry < 0)) return null;
  const [x, y, width, height] = numbers.map(Math.round);
  const kind = region.kind === "lasso" || region.kind === "paint" ? region.kind : "box";
  const paths = kind === "box" ? undefined : normalizePaths(region.paths);
  if (kind !== "box" && !paths) return null;
  return {
    id: region.id,
    kind,
    x,
    y,
    width,
    height,
    ...(paths ? { paths } : {}),
    ...(kind === "paint" ? { brush: Math.max(1, Math.round(Number(region.brush) || 1)) } : {}),
    fuzz: clampFuzz(Number(region.fuzz)),
    prompt: asText(region.prompt),
    referenceId: typeof region.referenceId === "string" && region.referenceId ? region.referenceId : null
  };
}

export function normalizeFlux3ImageDraft(value: unknown): Flux3ImageDraft {
  const record = asRecord(value);
  const prompts = asRecord(record.prompts);
  // Drafts saved before regions held `boxes`; they carry over as box regions.
  const regions = Array.isArray(record.regions) ? record.regions : Array.isArray(record.boxes) ? record.boxes : [];
  return {
    mode: record.mode === "i2i" || record.mode === "edit" || record.mode === "precise" ? record.mode : "t2i",
    editTool: record.editTool === "lasso" || record.editTool === "eraser" ? record.editTool : "brush",
    regionTool: record.regionTool === "brush" || record.regionTool === "lasso" ? record.regionTool : "box",
    prompts: { t2i: asText(prompts.t2i), i2i: asText(prompts.i2i), edit: asText(prompts.edit) },
    references: Array.from({ length: FLUX3_IMAGE_MAX_REFERENCES }, (_, index) => {
      const id = Array.isArray(record.references) ? record.references[index] : null;
      return typeof id === "string" && id ? id : null;
    }),
    regions: regions.map(normalizeRegion).filter((region): region is Flux3ImageRegion => !!region),
    regionSourceId:
      typeof record.regionSourceId === "string"
        ? record.regionSourceId
        : typeof record.boxSourceId === "string"
          ? record.boxSourceId
          : null
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

  // A different source image invalidates regions drawn in the old one's
  // pixels. No source (still loading after a reload, or cleared) keeps them.
  useEffect(() => {
    if (!hydrated || !sourceId) return;
    setDraft((current) =>
      current.regionSourceId === sourceId ? current : { ...current, regions: [], regionSourceId: sourceId }
    );
  }, [hydrated, sourceId]);

  function update(patch: Partial<Flux3ImageDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return { draft, update, setDraft };
}
