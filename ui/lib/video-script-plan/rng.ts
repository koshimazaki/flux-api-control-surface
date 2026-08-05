/**
 * Deterministic seeded randomness for plan expansion.
 *
 * The planner never calls `Math.random` or `Date.now`: identical input plus an
 * identical seed must always produce identical rows so a batch preview can be
 * shared, re-opened, and re-planned. The seed controls selection and ordering
 * only. FLUX.3 exposes no fresh-generation seed, so this never promises an
 * identical render.
 */

/** mulberry32: small, fast, and stable across engines for a 32-bit seed. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, length), clamped so a 0.999... draw cannot overflow. */
export function randomIndex(random: () => number, length: number) {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.floor(random() * length));
}

/** Coerces any user-supplied seed into a stable non-negative 32-bit integer. */
export function normalizeSeed(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.abs(Math.trunc(value)) >>> 0;
}
