/**
 * Where each FLUX 3 Image box's card was dragged to, by box id, so a card
 * reopens where it was left after selecting another box or reloading. A
 * convenience only: kept in browser storage, and anything unreadable is
 * treated as no offset.
 */
export type CardOffset = { x: number; y: number };

type OffsetStorage = Pick<Storage, "getItem" | "setItem">;

export const CARD_OFFSETS_KEY = "bfl-flux3-image-card-offsets";
/** Boxes come and go; only the most recent cards are remembered. */
const MAX_REMEMBERED = 100;

function browserStorage(): OffsetStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readAll(storage: OffsetStorage | null): Array<[string, CardOffset]> {
  try {
    const stored = JSON.parse(storage?.getItem(CARD_OFFSETS_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry): entry is [string, CardOffset] =>
        Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(entry[1]?.x) && Number.isFinite(entry[1]?.y)
    );
  } catch {
    return [];
  }
}

export function rememberedCardOffset(id: string, storage = browserStorage()): CardOffset {
  return readAll(storage).find(([key]) => key === id)?.[1] ?? { x: 0, y: 0 };
}

/** Stores a card's offset, newest last; a zero offset forgets it. */
export function rememberCardOffset(id: string, offset: CardOffset, storage = browserStorage()) {
  const others = readAll(storage).filter(([key]) => key !== id);
  const next = offset.x || offset.y ? [...others, [id, { x: Math.round(offset.x), y: Math.round(offset.y) }] as [string, CardOffset]] : others;
  try {
    storage?.setItem(CARD_OFFSETS_KEY, JSON.stringify(next.slice(-MAX_REMEMBERED)));
  } catch {
    // Storage can be full or blocked; the card simply opens beside its box next time.
  }
}
