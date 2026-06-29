import { describe, expect, it } from "vitest";
import { randomSeedNumber, randomSeedString } from "@/lib/seed";

describe("seed helpers", () => {
  it("creates integer seeds in the 0-9999 range", () => {
    expect(randomSeedNumber(() => 0)).toBe(0);
    expect(randomSeedNumber(() => 0.999999)).toBe(9999);
    expect(randomSeedNumber(() => 1)).toBe(9999);
    expect(randomSeedString(() => 0.42)).toBe("4200");
  });
});
