import { BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT } from "./provider-registry";
import type { FinetuneRecord } from "./types";

// Pure helpers for the local finetune registry and for shaping finetuned
// generation payloads. No fs/DOM here so everything is unit-testable; the route
// (app/api/finetunes) owns persistence.

export const FINETUNE_BASE_MODEL = "flux2-klein-9b";
export const DEFAULT_FINETUNE_STRENGTH = 1.2;
export const MIN_FINETUNE_STRENGTH = 0;
export const MAX_FINETUNE_STRENGTH = 2;

export function clampFinetuneStrength(value: unknown, fallback = DEFAULT_FINETUNE_STRENGTH): number {
  // null / undefined / "" are "not provided" -> fallback. Without this, Number(null)
  // and Number("") both coerce to 0, silently giving a zero-strength (no-op) LoRA.
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_FINETUNE_STRENGTH, Math.max(MIN_FINETUNE_STRENGTH, numeric));
}

export type FinetuneInput = {
  id?: unknown;
  finetuneId?: unknown;
  label?: unknown;
  triggerWord?: unknown;
  defaultStrength?: unknown;
  comment?: unknown;
  baseModel?: unknown;
  createdAt?: unknown;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function generateRecordId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `ft_${crypto.randomUUID()}`;
  return `ft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// Validate + coerce raw input into a stored FinetuneRecord. baseModel is always
// pinned to the klein base; defaultStrength is clamped to 0..2.
export function normalizeFinetuneRecord(
  input: FinetuneInput,
  existing?: FinetuneRecord
): { record?: FinetuneRecord; error?: string } {
  const finetuneId = cleanString(input.finetuneId) || (existing ? cleanString(existing.finetuneId) : "");
  if (!finetuneId) return { error: "finetuneId is required" };

  const comment = cleanString(input.comment) || (existing?.comment ? cleanString(existing.comment) : "");
  const record: FinetuneRecord = {
    id: cleanString(input.id) || existing?.id || generateRecordId(),
    finetuneId,
    label: cleanString(input.label) || existing?.label || finetuneId,
    baseModel: FINETUNE_BASE_MODEL,
    triggerWord: cleanString(input.triggerWord) || existing?.triggerWord || "",
    defaultStrength: clampFinetuneStrength(
      input.defaultStrength,
      existing?.defaultStrength ?? DEFAULT_FINETUNE_STRENGTH
    ),
    createdAt: cleanString(input.createdAt) || existing?.createdAt || new Date().toISOString()
  };
  if (comment) record.comment = comment;
  return { record };
}

export function upsertFinetune(
  records: FinetuneRecord[],
  input: FinetuneInput
): { records: FinetuneRecord[]; record?: FinetuneRecord; error?: string } {
  const list = Array.isArray(records) ? records : [];
  const incomingId = cleanString(input.id);
  const incomingFinetuneId = cleanString(input.finetuneId);
  const index = list.findIndex(
    (entry) =>
      (incomingId && entry.id === incomingId) ||
      (incomingFinetuneId && entry.finetuneId === incomingFinetuneId)
  );
  const existing = index >= 0 ? list[index] : undefined;
  const { record, error } = normalizeFinetuneRecord(input, existing);
  if (error || !record) return { records: list, error };

  const next = list.slice();
  if (index >= 0) next[index] = record;
  else next.unshift(record);
  return { records: next, record };
}

export function removeFinetune(
  records: FinetuneRecord[],
  id: string
): { records: FinetuneRecord[]; removed?: FinetuneRecord } {
  const list = Array.isArray(records) ? records : [];
  const target = cleanString(id);
  const removed = list.find((entry) => entry.id === target || entry.finetuneId === target);
  if (!removed) return { records: list };
  return { records: list.filter((entry) => entry !== removed), removed };
}

export type FinetuneGenerationRequest = {
  finetuneId: string;
  finetuneStrength: number;
  endpoint: string;
  payload: { finetune_id: string; finetune_strength: number };
};

// Shape the finetune-specific portion of a generation request. Returns null when
// no finetuneId is supplied so the caller falls back to the standard path.
export function resolveFinetuneGeneration(input: {
  finetuneId?: unknown;
  finetuneStrength?: unknown;
}): FinetuneGenerationRequest | null {
  const finetuneId = cleanString(input.finetuneId);
  if (!finetuneId) return null;
  const finetuneStrength = clampFinetuneStrength(input.finetuneStrength);
  return {
    finetuneId,
    finetuneStrength,
    endpoint: BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT,
    payload: { finetune_id: finetuneId, finetune_strength: finetuneStrength }
  };
}
