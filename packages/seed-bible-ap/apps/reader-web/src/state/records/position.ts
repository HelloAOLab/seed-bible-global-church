// READING POSITION — where the reader left off, on this device (prefs store). The Library's `seed:ReadingPosition`
// (one per reader, not bucketed) follows when the reading-history manager is ported.
import type { ReaderStores } from "../../backend/offline/db";

export interface Position {
  translationId: string;
  bookId: string;
  chapterNumber: number;
}

const KEY = "position";

export function createPosition(stores: ReaderStores) {
  return {
    load: async (): Promise<Position | null> =>
      ((await stores.prefs.get(KEY)) as Position | undefined) ?? null,
    save: (p: Position) => stores.prefs.set(KEY, p),
  };
}
