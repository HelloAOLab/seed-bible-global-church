// THE SCRIPTURE MAP — a first cut of packages/scripture-map: every book as a row of its chapters, the chapter on
// screen outlined, each chapter shaded by the days you read it (the history buckets on this device, pulled from
// the Library when signed in) and dotted when it holds a highlight or note of yours.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";

export function ScriptureMapPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading } = state;
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [reads, setReads] = useState<Record<string, number>>({});
  const changed = state.buckets.changed.value;

  useEffect(() => {
    void (async () => {
      const counts: Record<string, number> = {};
      for (const k of await state.stores.buckets.keys()) {
        const m = /^(highlights|annotations):([A-Z0-9]{3}\.\d+)$/.exec(k);
        if (!m) continue;
        const b = await state.stores.buckets.get(k);
        const n = b?.["@graph"].filter((it) => !it.deleted).length ?? 0;
        counts[m[2]!] = (counts[m[2]!] ?? 0) + n;
      }
      setMarks(counts);
      setReads(await state.history.heat());
    })();
  }, [changed]);

  const max = Math.max(1, ...Object.values(reads));
  return (
    <section
      className="sb-pane sb-scripture-map"
      aria-label={t("scripture-map", { defaultValue: "Scripture map" })}
    >
      <header className="sb-pane-header">
        <h2>{t("scripture-map", { defaultValue: "Scripture map" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      <p className="sb-small sb-muted">
        {t("scripture-map-blurb", {
          defaultValue:
            "Every chapter of the open translation. Shaded by how often you have read it; a dot marks a highlight or note; the chapter on screen is outlined.",
        })}
      </p>
      <div className="sb-map">
        {reading.books.value.map((b) => (
          <div key={b.id} className="sb-map-book">
            <div className="sb-map-book-name" title={b.name}>
              {b.id}
            </div>
            <div className="sb-map-chapters">
              {Array.from({ length: b.numberOfChapters }, (_, i) => i + 1).map(
                (c) => {
                  const key = `${b.id}.${c}`;
                  const n = marks[key] ?? 0;
                  const r = reads[key] ?? 0;
                  const here =
                    reading.bookId.value === b.id &&
                    reading.chapterNumber.value === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`sb-map-chapter${here ? " sb-map-chapter-here" : ""}${n ? " sb-map-chapter-marked" : ""}`}
                      title={`${b.name} ${c}${r ? ` · read ${r} day${r === 1 ? "" : "s"}` : ""}${n ? ` · ${n} mark${n === 1 ? "" : "s"}` : ""}`}
                      style={
                        {
                          "--sb-map-heat": r ? 0.25 + (0.75 * r) / max : 0,
                        } as never
                      }
                      onClick={() =>
                        void reading.goTo(reading.translationId.value, b.id, c)
                      }
                    />
                  );
                }
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
