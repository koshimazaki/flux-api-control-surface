import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINETUNE_STRENGTH,
  clampFinetuneStrength,
  normalizeFinetuneRecord,
  removeFinetune,
  resolveFinetuneGeneration,
  upsertFinetune
} from "@/lib/finetune-registry";
import { BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT, bflFinetunedKleinModel } from "@/lib/provider-registry";
import type { FinetuneRecord } from "@/lib/types";

describe("clampFinetuneStrength", () => {
  it("clamps to 0..2 and falls back to the default for non-numbers", () => {
    expect(clampFinetuneStrength(5)).toBe(2);
    expect(clampFinetuneStrength(-1)).toBe(0);
    expect(clampFinetuneStrength(1.4)).toBe(1.4);
    expect(clampFinetuneStrength("1.5")).toBe(1.5);
    expect(clampFinetuneStrength(undefined)).toBe(DEFAULT_FINETUNE_STRENGTH);
    expect(clampFinetuneStrength("nope")).toBe(DEFAULT_FINETUNE_STRENGTH);
    expect(clampFinetuneStrength(NaN, 0.5)).toBe(0.5);
    // null / empty are "not provided" -> fallback, NOT a 0-strength no-op LoRA.
    expect(clampFinetuneStrength(null)).toBe(DEFAULT_FINETUNE_STRENGTH);
    expect(clampFinetuneStrength("")).toBe(DEFAULT_FINETUNE_STRENGTH);
    // An explicit 0 is still honored.
    expect(clampFinetuneStrength(0)).toBe(0);
  });
});

describe("normalizeFinetuneRecord", () => {
  it("rejects a missing finetuneId", () => {
    expect(normalizeFinetuneRecord({ finetuneId: "" }).error).toMatch(/finetuneId/);
    expect(normalizeFinetuneRecord({}).error).toMatch(/finetuneId/);
  });

  it("pins the base model, clamps strength, and fills sane defaults", () => {
    const { record, error } = normalizeFinetuneRecord({ finetuneId: "  ft-123  ", defaultStrength: 9 });
    expect(error).toBeUndefined();
    expect(record?.finetuneId).toBe("ft-123");
    expect(record?.baseModel).toBe("flux2-klein-9b");
    expect(record?.label).toBe("ft-123");
    expect(record?.defaultStrength).toBe(2);
    expect(typeof record?.id).toBe("string");
    expect(typeof record?.createdAt).toBe("string");
  });

  it("preserves an existing id/createdAt when updating", () => {
    const existing: FinetuneRecord = {
      id: "keep-id",
      finetuneId: "ft-123",
      label: "Old",
      baseModel: "flux2-klein-9b",
      triggerWord: "bfl_x",
      defaultStrength: 1,
      createdAt: "2024-01-01T00:00:00.000Z"
    };
    const { record } = normalizeFinetuneRecord({ finetuneId: "ft-123", label: "New" }, existing);
    expect(record?.id).toBe("keep-id");
    expect(record?.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(record?.label).toBe("New");
    expect(record?.triggerWord).toBe("bfl_x");
  });
});

describe("upsertFinetune / removeFinetune", () => {
  it("inserts new records and updates existing ones in place by finetuneId", () => {
    const inserted = upsertFinetune([], { finetuneId: "ft-a", label: "A", defaultStrength: 1.1 });
    expect(inserted.records).toHaveLength(1);
    expect(inserted.record?.label).toBe("A");

    const updated = upsertFinetune(inserted.records, { finetuneId: "ft-a", label: "A2", defaultStrength: -5 });
    expect(updated.records).toHaveLength(1);
    expect(updated.record?.label).toBe("A2");
    expect(updated.record?.defaultStrength).toBe(0);
    expect(updated.record?.id).toBe(inserted.record?.id);
  });

  it("surfaces validation errors without mutating the list", () => {
    const seed = upsertFinetune([], { finetuneId: "ft-a" }).records;
    const result = upsertFinetune(seed, { finetuneId: "   " });
    expect(result.error).toMatch(/finetuneId/);
    expect(result.records).toBe(seed);
  });

  it("removes by id or by finetuneId", () => {
    const seeded = upsertFinetune([], { finetuneId: "ft-a", label: "A" });
    const record = seeded.record!;
    expect(removeFinetune(seeded.records, record.id).removed?.finetuneId).toBe("ft-a");
    expect(removeFinetune(seeded.records, "ft-a").records).toHaveLength(0);
    expect(removeFinetune(seeded.records, "missing").removed).toBeUndefined();
  });
});

describe("resolveFinetuneGeneration (generate payload shaping)", () => {
  it("returns null when no finetuneId is supplied", () => {
    expect(resolveFinetuneGeneration({})).toBeNull();
    expect(resolveFinetuneGeneration({ finetuneId: "" })).toBeNull();
    expect(resolveFinetuneGeneration({ finetuneId: "   " })).toBeNull();
  });

  it("targets the hosted klein finetuned endpoint with a clamped strength", () => {
    const resolved = resolveFinetuneGeneration({ finetuneId: "  ft-xyz ", finetuneStrength: 5 });
    expect(resolved).not.toBeNull();
    expect(resolved?.endpoint).toBe("flux-2-klein-9b-kv-finetuned");
    expect(resolved?.payload.finetune_id).toBe("ft-xyz");
    expect(resolved?.payload.finetune_strength).toBe(2);

    const defaulted = resolveFinetuneGeneration({ finetuneId: "ft-xyz" });
    expect(defaulted?.payload.finetune_strength).toBe(DEFAULT_FINETUNE_STRENGTH);

    const floored = resolveFinetuneGeneration({ finetuneId: "ft-xyz", finetuneStrength: -3 });
    expect(floored?.payload.finetune_strength).toBe(0);
  });
});

describe("bflFinetunedKleinModel", () => {
  it("exposes the finetuned endpoint with klein-9b capabilities and is not in the base catalog", () => {
    const model = bflFinetunedKleinModel();
    expect(model.endpoint).toBe(BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT);
    expect(BFL_FLUX2_KLEIN_FINETUNED_ENDPOINT).toBe("flux-2-klein-9b-kv-finetuned");
    expect(model.maxReferences).toBe(4);
    expect(model.maxMegapixels).toBe(4);
    expect(model.capabilities.maxReferences).toBe(4);
    expect(model.supportsPromptUpsampling).toBe(false);
    expect(model.value).toBe("klein-9b-finetuned");
  });
});
