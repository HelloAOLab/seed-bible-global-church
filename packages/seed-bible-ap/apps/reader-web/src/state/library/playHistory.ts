// PLAYLIST HISTORY — the old PlaylistManager's play history: ONE row per playlist (its latest play), with where the
// reader stopped, how far through, when and for how long; newest first, capped, grouped by day for the pane, and
// resumable at the step they left. Kept on this device (a preference), like the reading position.
export interface PlayHistoryEntry {
  playlistId: string;
  title: string;
  totalSteps: number;
  /** The 0-based step last shown. */
  currentStep: number;
  /** What that step was, for the row ("John 3 · BSB", a note's first words). */
  lastItem: string;
  startedAt: number;
  /** Set when the reader stopped; absent while still playing. */
  endedAt?: number;
  durationMs: number;
}

export const MAX_PLAY_HISTORY = 200;

/** Newest play per playlist, newest first, capped. */
export function retainPlayHistory(
  entries: readonly PlayHistoryEntry[]
): PlayHistoryEntry[] {
  const seen = new Set<string>();
  const out: PlayHistoryEntry[] = [];
  for (const e of [...entries].sort((a, b) => b.startedAt - a.startedAt)) {
    if (seen.has(e.playlistId)) continue;
    seen.add(e.playlistId);
    out.push(e);
    if (out.length >= MAX_PLAY_HISTORY) break;
  }
  return out;
}

const dayKeyOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Rows grouped by the local calendar day they were played on, newest day first. */
export function groupPlayHistoryByDay(
  entries: readonly PlayHistoryEntry[]
): Array<{ day: string; entries: PlayHistoryEntry[] }> {
  const groups = new Map<string, PlayHistoryEntry[]>();
  for (const e of retainPlayHistory(entries)) {
    const k = dayKeyOf(e.startedAt);
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups].map(([day, es]) => ({ day, entries: es }));
}

/** "today", "yesterday", or the date — the day group's heading. */
export function dayKind(
  day: string,
  now = Date.now()
): "today" | "yesterday" | "earlier" {
  if (day === dayKeyOf(now)) return "today";
  if (day === dayKeyOf(now - 86_400_000)) return "yesterday";
  return "earlier";
}

/** Finished means the reader reached the last step. */
export const isComplete = (e: PlayHistoryEntry) =>
  e.totalSteps > 0 && e.currentStep >= e.totalSteps - 1;

export const percentOf = (e: PlayHistoryEntry) =>
  e.totalSteps > 0 ? Math.round(((e.currentStep + 1) / e.totalSteps) * 100) : 0;
