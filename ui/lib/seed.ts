// Seed space for auto-generated seeds. 1,000,000 means random seeds land in
// [0, 999999]. A wide space matters when generating thousands of images across
// runs: with the birthday paradox, a 10k space collides ~50% of the time after
// only ~118 draws, while a 1M space pushes that to ~1178 draws.
export const RANDOM_SEED_LIMIT = 1_000_000;

export function randomSeedNumber(random = Math.random) {
  const value = Math.max(0, Math.min(0.999999999, random()));
  return Math.floor(value * RANDOM_SEED_LIMIT);
}

export function randomSeedString(random = Math.random) {
  return String(randomSeedNumber(random));
}

// Decide the seed to use after a run completes:
// - locked  -> keep the current seed (never auto-randomise),
// - unlocked -> roll a fresh random seed so the next run differs.
export function advanceSeed(locked: boolean, current: string, random = Math.random) {
  return locked ? current : randomSeedString(random);
}
