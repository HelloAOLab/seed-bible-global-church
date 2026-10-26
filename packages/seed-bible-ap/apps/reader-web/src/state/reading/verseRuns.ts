// CHOSEN VERSES AS RUNS — the old reader lets a tap add or drop any one verse, so a choice can have gaps: these are
// its unbroken runs, the reference written from them ("John 3:16, 18–19"), and Copy's text ("… (John 3:16 BSB)" per
// run, as the old reader's formatSelectedVerses).

/** The runs of consecutive verses in a choice, in order. */
export function runsOf(verses: readonly number[]): [number, number][] {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const v of sorted) {
    const last = runs[runs.length - 1];
    if (last && v === last[1] + 1) last[1] = v;
    else runs.push([v, v]);
  }
  return runs;
}

/** "16, 18–19". */
export const runsLabel = (runs: readonly [number, number][]) =>
  runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");

/** Each run's words with its reference after them, runs a blank line apart. */
export function copyTextOf(
  runs: readonly [number, number][],
  textOf: (verse: number) => string,
  book: string,
  chapter: number,
  translation: string
): string {
  return runs
    .map(([a, b]) => {
      const words: string[] = [];
      for (let v = a; v <= b; v++) {
        const w = textOf(v);
        if (w) words.push(w);
      }
      const range = a === b ? `${a}` : `${a}-${b}`;
      const reference = [book, `${chapter}:${range}`, translation]
        .filter(Boolean)
        .join(" ");
      return `${words.join(" ")} (${reference})`;
    })
    .join("\n\n");
}
