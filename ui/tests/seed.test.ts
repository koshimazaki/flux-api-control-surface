import { describe, expect, it } from "vitest";
import { RANDOM_SEED_LIMIT, advanceSeed, randomSeedNumber, randomSeedString } from "@/lib/seed";

// Deterministic PRNG (mulberry32) so spread assertions never flake.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("seed helpers", () => {
  it("uses a 1,000,000 seed space so large batches rarely repeat", () => {
    expect(RANDOM_SEED_LIMIT).toBe(1_000_000);
  });

  it("creates integer seeds in the 0-999999 range", () => {
    expect(randomSeedNumber(() => 0)).toBe(0);
    expect(randomSeedNumber(() => 0.999999999)).toBe(999999);
    expect(randomSeedNumber(() => 1)).toBe(999999);
    expect(randomSeedString(() => 0.5)).toBe("500000");
  });

  it("never returns a seed at or above the limit, even for out-of-range randoms", () => {
    for (const sample of [-0.2, 0, 0.0001, 0.5, 0.9, 0.999999, 0.9999999999, 1, 1.5]) {
      const seed = randomSeedNumber(() => sample);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(RANDOM_SEED_LIMIT);
    }
  });

  it("spreads seeds widely so thousands of draws stay almost entirely unique", () => {
    const draws = 5000;
    const random = mulberry32(0x1234abcd);
    const seeds = new Set<number>();
    for (let i = 0; i < draws; i += 1) seeds.add(randomSeedNumber(random));
    // Expected collisions in a 1M space across 5k draws are ~12, so >99% unique.
    expect(seeds.size).toBeGreaterThan(draws * 0.99);
  });

  describe("advanceSeed (auto-randomise vs lock)", () => {
    it("keeps the current seed when locked", () => {
      expect(advanceSeed(true, "424242", () => 0.5)).toBe("424242");
    });

    it("rolls a fresh seed when unlocked", () => {
      expect(advanceSeed(false, "424242", () => 0.5)).toBe("500000");
    });
  });
});
