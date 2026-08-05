import type { GenerationTiming } from "@/lib/generation-capture";

export type EvaluationVerdict = "unreviewed" | "keep" | "maybe" | "reject";

export type GenerationEvaluationAnnotation = {
  rating?: number;
  verdict: EvaluationVerdict;
  tags: string[];
  notes: string;
  updatedAt?: string;
};

export type GenerationEvaluationRecord = {
  schemaVersion: "bfl-evaluation/v1";
  id: string;
  title: string;
  createdAt: string;
  mediaType: "image" | "video";
  provider: string;
  model: string;
  endpoint: string;
  operation: string;
  mode?: string;
  status: "complete" | "failed" | "cancelled";
  failureClass?: string;
  /** Queue lifecycle facts: wait time, retries, and recovery events for this generation. */
  queue?: {
    jobId?: string;
    queueWaitMs?: number;
    retryCount?: number;
    attempts?: unknown[];
    recovery?: unknown[];
  };
  prompt: {
    text: string;
    approximateTokens: number;
    sourceIds: string[];
  };
  settings: Record<string, unknown>;
  timing?: GenerationTiming;
  cost: {
    submittedCredits?: number;
    chargedCredits?: number;
    creditsBefore?: number;
    creditsAfter?: number;
  };
  providerRequest: {
    id: string;
    pollingUrl?: string;
  };
  sources: {
    assetIds: string[];
    collectionIds: string[];
    keyframes: Array<{ assetId?: string; seconds?: number }>;
  };
  provenance: {
    batchId?: string;
    rowId?: string;
    rowIndex?: number;
  };
  output: {
    previewUrl: string;
    localPath?: string;
    metadataPath: string;
  };
  error?: string;
  annotation: GenerationEvaluationAnnotation;
};

export const DEFAULT_EVALUATION_ANNOTATION: GenerationEvaluationAnnotation = {
  verdict: "unreviewed",
  tags: [],
  notes: ""
};

export function approximatePromptTokens(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function normalizeEvaluationAnnotation(value: unknown): GenerationEvaluationAnnotation {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rating = typeof raw.rating === "number" && Number.isFinite(raw.rating)
    ? Math.max(1, Math.min(5, Math.round(raw.rating)))
    : undefined;
  const verdict = ["keep", "maybe", "reject"].includes(String(raw.verdict))
    ? (raw.verdict as EvaluationVerdict)
    : "unreviewed";
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20)
    : [];
  return {
    rating,
    verdict,
    tags,
    notes: typeof raw.notes === "string" ? raw.notes.trim().slice(0, 4000) : "",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined
  };
}

export function sanitizeEvaluationSettings(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[nested value omitted]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeEvaluationSettings(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && value.length > 1000) return `[${value.length} character value omitted]`;
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/api.?key|authorization|token|input_image|keyframes|start_video|draft_cache/i.test(key)) continue;
    result[key] = sanitizeEvaluationSettings(item, depth + 1);
  }
  return result;
}
