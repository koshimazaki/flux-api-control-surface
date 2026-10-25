import { describe, expect, it } from "vitest";
import { CARD_OFFSETS_KEY, rememberCardOffset, rememberedCardOffset } from "@/lib/flux3-image-card-offsets";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    values
  };
}

describe("remembered box card positions", () => {
  it("brings a card back where it was dragged, per box, and forgets it when reset", () => {
    const storage = memoryStorage();
    rememberCardOffset("box-a", { x: -140.4, y: 60 }, storage);
    rememberCardOffset("box-b", { x: 20, y: -10 }, storage);
    expect(rememberedCardOffset("box-a", storage)).toEqual({ x: -140, y: 60 });
    expect(rememberedCardOffset("box-b", storage)).toEqual({ x: 20, y: -10 });
    expect(rememberedCardOffset("box-new", storage)).toEqual({ x: 0, y: 0 });
    rememberCardOffset("box-a", { x: 0, y: 0 }, storage);
    expect(rememberedCardOffset("box-a", storage)).toEqual({ x: 0, y: 0 });
    expect(JSON.parse(storage.values[CARD_OFFSETS_KEY])).toEqual([["box-b", { x: 20, y: -10 }]]);
  });

  it("keeps only the most recent cards, and treats anything unreadable as no offset", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 105; index += 1) rememberCardOffset(`box-${index}`, { x: index + 1, y: 0 }, storage);
    expect(JSON.parse(storage.values[CARD_OFFSETS_KEY])).toHaveLength(100);
    expect(rememberedCardOffset("box-0", storage)).toEqual({ x: 0, y: 0 });
    expect(rememberedCardOffset("box-104", storage)).toEqual({ x: 105, y: 0 });
    expect(rememberedCardOffset("box-a", memoryStorage({ [CARD_OFFSETS_KEY]: "{oops" }))).toEqual({ x: 0, y: 0 });
    expect(rememberedCardOffset("box-a", null)).toEqual({ x: 0, y: 0 });
  });
});
