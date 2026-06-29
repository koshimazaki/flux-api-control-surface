export const RANDOM_SEED_LIMIT = 10_000;

export function randomSeedNumber(random = Math.random) {
  const value = Math.max(0, Math.min(0.999999999, random()));
  return Math.floor(value * RANDOM_SEED_LIMIT);
}

export function randomSeedString(random = Math.random) {
  return String(randomSeedNumber(random));
}
