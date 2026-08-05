import { mulberry32, randomIndex } from "./rng";
import type {
  VideoScriptGenerator,
  VideoScriptPool,
  VideoScriptSequenceMode,
  VideoScriptSlotBinding,
  VideoScriptWarning
} from "./types";
import { plural, warn } from "./warnings";

export type ExpansionResult = {
  /** Materialised rows of ordered asset IDs. */
  rows: string[][];
  /** Analytic count of the full expansion, even when fewer rows were built. */
  rawCount: number;
};

type ResolvedSlot = {
  options: string[];
  /** Pool-backed slots vary; pinned and manual slots repeat. */
  varying: boolean;
};

/**
 * Identity of an ordered keyframe row. JSON keeps the boundary unambiguous so no
 * separator character can ever collide with an asset ID.
 */
export function rowKey(assetIds: string[]) {
  return JSON.stringify(assetIds);
}

/**
 * Step 1 of the expansion order: normalize and deduplicate source asset IDs.
 * Pools that repeat an ID are merged rather than replaced so no source is lost.
 */
export function normalizePools(pools: VideoScriptPool[] | undefined, warnings: VideoScriptWarning[]) {
  const resolved = new Map<string, string[]>();
  let dropped = 0;

  for (const pool of pools ?? []) {
    if (!pool || typeof pool.id !== "string" || !pool.id.trim()) continue;
    const id = pool.id.trim();
    const existing = resolved.get(id) ?? [];
    const seen = new Set(existing);
    for (const raw of pool.assetIds ?? []) {
      const assetId = typeof raw === "string" ? raw.trim() : "";
      if (!assetId || seen.has(assetId)) {
        dropped += 1;
        continue;
      }
      seen.add(assetId);
      existing.push(assetId);
    }
    resolved.set(id, existing);
  }

  if (dropped) {
    warn(
      warnings,
      "source_duplicates_dropped",
      `Dropped ${dropped} duplicate or empty source asset ${plural(dropped, "id", "ids")}.`,
      { count: dropped }
    );
  }
  return resolved;
}

/**
 * Trims a hand-authored keyframe list. Manual rows may legitimately repeat an
 * image across keyframes, so only blanks are removed here; identical rows are
 * removed later by the ordered-row dedupe step.
 */
export function normalizeAssetIds(values: unknown) {
  if (!Array.isArray(values)) return [];
  const ids: string[] = [];
  for (const raw of values) {
    const assetId = typeof raw === "string" ? raw.trim() : "";
    if (!assetId) continue;
    ids.push(assetId);
  }
  return ids;
}

function combinationCount(n: number, k: number) {
  if (k <= 0 || k > n) return 0;
  let result = 1;
  for (let index = 0; index < k; index += 1) result = (result * (n - index)) / (index + 1);
  return Math.round(result);
}

function arrangementCount(n: number, k: number) {
  if (k <= 0 || k > n) return 0;
  let result = 1;
  for (let index = 0; index < k; index += 1) result *= n - index;
  return result;
}

/** Lexicographic index combinations, yielded lazily so a limit can stop them. */
function* combinationIndexes(n: number, k: number): Generator<number[]> {
  if (k <= 0 || k > n) return;
  const cursor = Array.from({ length: k }, (_, index) => index);
  for (;;) {
    yield [...cursor];
    let position = k - 1;
    while (position >= 0 && cursor[position] === n - k + position) position -= 1;
    if (position < 0) return;
    cursor[position] += 1;
    for (let next = position + 1; next < k; next += 1) cursor[next] = cursor[next - 1] + 1;
  }
}

/** Lexicographic ordered k-permutations, yielded lazily for the same reason. */
function* permutationIndexes(n: number, k: number): Generator<number[]> {
  if (k <= 0 || k > n) return;
  const used = new Array<boolean>(n).fill(false);
  const current: number[] = [];
  function* visit(): Generator<number[]> {
    if (current.length === k) {
      yield [...current];
      return;
    }
    for (let index = 0; index < n; index += 1) {
      if (used[index]) continue;
      used[index] = true;
      current.push(index);
      yield* visit();
      current.pop();
      used[index] = false;
    }
  }
  yield* visit();
}

function expandSequence(
  pool: string[],
  slotCount: number,
  mode: VideoScriptSequenceMode,
  limit: number,
  warnings: VideoScriptWarning[]
): ExpansionResult {
  const size = pool.length;
  const slots = Number.isFinite(slotCount) ? Math.trunc(slotCount) : 0;
  if (size === 0 || slots <= 0) return { rows: [], rawCount: 0 };

  if (mode === "rotation") {
    // One rotation per starting image; positions wrap so a short pool can still
    // fill a longer row (the classic morph-chain batch).
    const rows: string[][] = [];
    for (let start = 0; start < size && rows.length < limit; start += 1) {
      rows.push(Array.from({ length: slots }, (_, offset) => pool[(start + offset) % size]));
    }
    return { rows, rawCount: size };
  }

  if (slots > size) {
    warn(
      warnings,
      "pool_too_small",
      `The pool holds ${size} ${plural(size, "image", "images")} but ${slots} keyframe ${plural(slots, "slot", "slots")} are requested, so ${mode} expansion produced no rows.`,
      { count: size, limit: slots }
    );
    return { rows: [], rawCount: 0 };
  }

  const rawCount = mode === "combination" ? combinationCount(size, slots) : arrangementCount(size, slots);
  const source = mode === "combination" ? combinationIndexes(size, slots) : permutationIndexes(size, slots);
  const rows: string[][] = [];
  for (const indexes of source) {
    if (rows.length >= limit) break;
    rows.push(indexes.map((index) => pool[index]));
  }
  return { rows, rawCount };
}

function resolveSlots(
  slots: VideoScriptSlotBinding[] | undefined,
  pools: Map<string, string[]>,
  warnings: VideoScriptWarning[]
): ResolvedSlot[] {
  const resolved: ResolvedSlot[] = [];
  let missingPools = 0;
  let emptySlots = 0;

  for (const slot of slots ?? []) {
    if (!slot) {
      emptySlots += 1;
      continue;
    }
    if (slot.kind === "pool") {
      const poolId = typeof slot.poolId === "string" ? slot.poolId.trim() : "";
      const pool = poolId ? pools.get(poolId) : undefined;
      if (!pool?.length) {
        missingPools += 1;
        continue;
      }
      resolved.push({ options: pool, varying: true });
      continue;
    }
    const assetId = typeof slot.assetId === "string" ? slot.assetId.trim() : "";
    if (!assetId) {
      // An unfilled slot is an unused keyframe position, not a hole in the row.
      emptySlots += 1;
      continue;
    }
    resolved.push({ options: [assetId], varying: false });
  }

  if (missingPools) {
    warn(
      warnings,
      "missing_pool",
      `Skipped ${missingPools} slot ${plural(missingPools, "binding", "bindings")} whose pool is missing or empty.`,
      { count: missingPools }
    );
  }
  if (emptySlots) {
    warn(
      warnings,
      "empty_slot_skipped",
      `Skipped ${emptySlots} unfilled keyframe ${plural(emptySlots, "slot", "slots")}.`,
      { count: emptySlots }
    );
  }
  return resolved;
}

function expandCartesian(slots: ResolvedSlot[], limit: number): ExpansionResult {
  if (!slots.length) return { rows: [], rawCount: 0 };
  const rawCount = slots.reduce((total, slot) => total * slot.options.length, 1);
  if (rawCount === 0) return { rows: [], rawCount: 0 };

  const rows: string[][] = [];
  const cursor = new Array<number>(slots.length).fill(0);
  const target = Math.min(rawCount, limit);
  while (rows.length < target) {
    rows.push(slots.map((slot, index) => slot.options[cursor[index]]));
    let position = slots.length - 1;
    while (position >= 0) {
      cursor[position] += 1;
      if (cursor[position] < slots[position].options.length) break;
      cursor[position] = 0;
      position -= 1;
    }
    if (position < 0) break;
  }
  return { rows, rawCount };
}

function expandZip(slots: ResolvedSlot[], limit: number, warnings: VideoScriptWarning[]): ExpansionResult {
  if (!slots.length) return { rows: [], rawCount: 0 };
  const varyingLengths = slots.filter((slot) => slot.varying).map((slot) => slot.options.length);
  // Pinned and manual slots repeat down the batch; only pool-backed slots set
  // the zip length, and mismatched pools truncate to the shortest.
  const length = varyingLengths.length ? Math.min(...varyingLengths) : 1;
  const longest = varyingLengths.length ? Math.max(...varyingLengths) : 1;
  if (longest > length) {
    warn(
      warnings,
      "zip_length_mismatch",
      `Zipped pools differ in length (${length} to ${longest}); truncated to ${length} ${plural(length, "row", "rows")}.`,
      { count: longest - length, limit: length }
    );
  }

  const rows: string[][] = [];
  for (let index = 0; index < Math.min(length, limit); index += 1) {
    rows.push(slots.map((slot) => (slot.varying ? slot.options[index] : slot.options[0])));
  }
  return { rows, rawCount: length };
}

function expandSample(
  slots: ResolvedSlot[],
  sampleSize: number,
  seed: number,
  limit: number,
  warnings: VideoScriptWarning[]
): ExpansionResult {
  if (!slots.length) return { rows: [], rawCount: 0 };
  const space = slots.reduce((total, slot) => total * slot.options.length, 1);
  const requested = Number.isFinite(sampleSize) ? Math.max(0, Math.trunc(sampleSize)) : 0;
  const rawCount = Math.min(requested, space);
  const target = Math.min(rawCount, limit);
  if (target <= 0) return { rows: [], rawCount };

  const random = mulberry32(seed);
  const seen = new Set<string>();
  const rows: string[][] = [];
  // Rejection sampling keeps draws distinct where the space allows, and the
  // attempt bound keeps this a bounded pure function.
  const maxAttempts = Math.max(target * 12, 64);
  for (let attempt = 0; attempt < maxAttempts && rows.length < target; attempt += 1) {
    const row = slots.map((slot) => slot.options[randomIndex(random, slot.options.length)]);
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  if (rows.length < target) {
    warn(
      warnings,
      "sample_incomplete",
      `Sampled ${rows.length} distinct ${plural(rows.length, "row", "rows")} of the ${target} requested.`,
      { count: target - rows.length, limit: target }
    );
  }
  return { rows, rawCount };
}

/**
 * Steps 2 and 3 of the expansion order: apply pinned/manual slot bindings, then
 * expand the selected image mode. Returns the analytic raw count alongside the
 * rows actually built so the preview chain can report both.
 */
export function expandImageRows(
  generator: VideoScriptGenerator | undefined,
  pools: Map<string, string[]>,
  options: { seed: number; limit: number },
  warnings: VideoScriptWarning[]
): ExpansionResult {
  if (!generator) return { rows: [], rawCount: 0 };
  const limit = Math.max(0, Math.trunc(options.limit));

  if (generator.workflow === "sequence") {
    const poolId = typeof generator.poolId === "string" ? generator.poolId.trim() : "";
    const pool = poolId ? pools.get(poolId) : undefined;
    if (!pool?.length) {
      warn(warnings, "missing_pool", `The sequence pool "${poolId || "(unnamed)"}" is missing or empty.`, { count: 1 });
      return { rows: [], rawCount: 0 };
    }
    return expandSequence(pool, generator.slotCount, generator.mode, limit, warnings);
  }

  const slots = resolveSlots(generator.slots, pools, warnings);
  if (!slots.length) return { rows: [], rawCount: 0 };
  if (generator.strategy === "zip") return expandZip(slots, limit, warnings);
  if (generator.strategy === "sample") {
    return expandSample(slots, generator.sampleSize ?? 8, options.seed, limit, warnings);
  }
  return expandCartesian(slots, limit);
}

/** Step 4: drop identical ordered keyframe rows, keeping the first occurrence. */
export function dedupeRows<T extends { assetIds: string[] }>(rows: T[]) {
  const seen = new Set<string>();
  const kept: T[] = [];
  let dropped = 0;
  for (const row of rows) {
    const key = rowKey(row.assetIds);
    if (seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    kept.push(row);
  }
  return { rows: kept, dropped };
}
