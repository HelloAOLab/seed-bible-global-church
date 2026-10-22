// COMPARE — ported from packages/compare-extension: select verses, tap Compare, read them in several translations
// side by side, switch the reader to one. Browser-local: the Bible API only.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import type { ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import type { TranslationBookChapter } from "../../backend/bible";
import { getVersePlainText } from "../../components/reader/chapterContent";
import { useI18n } from "../../i18n";
import "./compare.css";

const KEY = "compare:translations";
const DEFAULTS = ["WEB", "KJV", "ESV"];

interface Snapshot {
  chapterRef: string;
  bookId: string;
  chapterNumber: number;
  verses: number[];
}

const snapshot = signal<Snapshot | null>(null);
const chosen = signal<string[]>([]);
const chapters = signal<
  Map<string, TranslationBookChapter | "loading" | "error">
>(new Map());

function versesText(chapter: TranslationBookChapter, verses: number[]) {
  return chapter.chapter.content
    .filter(
      (e): e is Extract<typeof e, { type: "verse" }> =>
        !!e &&
        typeof e === "object" &&
        e.type === "verse" &&
        verses.includes(e.number)
    )
    .map((v) => ({ number: v.number, text: getVersePlainText(v.content) }));
}

function Pane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const snap = snapshot.value;
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const current = state.reading.translationId.value;
  const ids = [current, ...chosen.value.filter((id) => id !== current)];

  useEffect(() => {
    if (!snap) return;
    void state.reading.loadTranslations();
    for (const id of ids) {
      const key = `${id}/${snap.bookId}/${snap.chapterNumber}`;
      if (chapters.value.has(key)) continue;
      chapters.value = new Map(chapters.value).set(key, "loading");
      state.api
        .getTranslationBookChapter(id, snap.bookId, snap.chapterNumber)
        .then((c) => (chapters.value = new Map(chapters.value).set(key, c)))
        .catch(
          () => (chapters.value = new Map(chapters.value).set(key, "error"))
        );
    }
  }, [snap, ids.join(",")]);

  if (!snap)
    return (
      <p className="sb-pane-empty">
        {t("compare-select", {
          defaultValue: "Select verses in the reader, then tap Compare.",
        })}
      </p>
    );
  const ref = `${state.reading.bookName.value} ${snap.chapterNumber}:${snap.verses[0]}${snap.verses.length > 1 ? `–${snap.verses[snap.verses.length - 1]}` : ""}`;
  const list = state.reading.translations.value.filter(
    (tr) =>
      !ids.includes(tr.id) &&
      (!q ||
        `${tr.id} ${tr.name} ${tr.englishName} ${tr.languageEnglishName ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase()))
  );

  return (
    <div className="sb-compare-pane">
      <div className="sb-compare-title-row">
        <span className="sb-compare-reference">{ref}</span>
        <button
          className="sb-compare-add-button"
          onClick={() => setPicking((p) => !p)}
        >
          <span className="material-symbols-outlined">add</span>{" "}
          {t("add-translation", { defaultValue: "Add translation" })}
        </button>
      </div>
      {picking && (
        <div className="sb-compare-picker">
          <div className="sb-compare-picker-search-row">
            <input
              className="sb-note-editor"
              placeholder={t("search-translation", {
                defaultValue: "Search translations...",
              })}
              value={q}
              onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="sb-translation-list">
            {list.slice(0, 40).map((tr) => (
              <button
                key={tr.id}
                className="sb-translation-row"
                onClick={() => {
                  chosen.value = [...chosen.value, tr.id];
                  void state.stores.prefs.set(KEY, chosen.value);
                  setPicking(false);
                }}
              >
                <span className="sb-translation-row-short">
                  {tr.shortName ?? tr.id}
                </span>
                <span className="sb-translation-row-name">{tr.name}</span>
                <span className="sb-translation-row-lang">
                  {tr.languageEnglishName ?? tr.language}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sb-compare-blocks sb-compare-scroll">
        {ids.map((id) => {
          const key = `${id}/${snap.bookId}/${snap.chapterNumber}`;
          const c = chapters.value.get(key);
          const tr =
            state.reading.translations.value.find((x) => x.id === id) ??
            (c && typeof c === "object" ? c.translation : null);
          const isCurrent = id === current;
          return (
            <div key={id} className="sb-compare-block">
              {isCurrent ? (
                <div className="sb-compare-block-header">
                  <span className="sb-compare-block-abbreviation">
                    {tr?.shortName ?? id}
                  </span>
                  <span className="sb-compare-block-name">
                    {tr?.name ?? ""}
                  </span>
                </div>
              ) : (
                <button
                  className="sb-compare-block-header sb-compare-block-header--switch"
                  title={t("read-this-translation", {
                    defaultValue: "Read this translation",
                  })}
                  onClick={() => void state.reading.setTranslation(id)}
                >
                  <span className="sb-compare-block-abbreviation">
                    {tr?.shortName ?? id}
                  </span>
                  <span className="sb-compare-block-name">
                    {tr?.name ?? ""}
                  </span>
                </button>
              )}
              <div className="sb-compare-block-body">
                {!c || c === "loading" ? (
                  <p className="sb-compare-block-message">
                    {t("loading", { defaultValue: "Loading…" })}
                  </p>
                ) : c === "error" ? (
                  <p className="sb-compare-block-message">
                    {t("comparison-load-failed", {
                      defaultValue: "Could not load this translation.",
                    })}
                  </p>
                ) : (
                  <p
                    className="sb-compare-block-text"
                    dir={tr?.textDirection ?? "auto"}
                  >
                    {versesText(c, snap.verses).map((v) => (
                      <span key={v.number} className="sb-compare-verse">
                        <sup className="sb-compare-verse-number">
                          {v.number}
                        </sup>{" "}
                        {v.text}{" "}
                      </span>
                    ))}
                  </p>
                )}
                {!isCurrent && (
                  <button
                    className="sb-compare-retry"
                    onClick={() => {
                      chosen.value = chosen.value.filter((x) => x !== id);
                      void state.stores.prefs.set(KEY, chosen.value);
                    }}
                  >
                    {t("remove", { defaultValue: "Remove" })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const compare: ExtensionRegistration = {
  id: "compare",
  label: "Compare translations",
  description: "Read selected verses in several translations side by side.",
  init: function* (ctx) {
    const { state } = ctx;
    void state.stores.prefs.get(KEY).then((v) => {
      chosen.value = Array.isArray(v) ? (v as string[]) : DEFAULTS;
    });
    yield ctx.panes.register({
      id: "compare",
      title: "Compare",
      render: () => <Pane state={state} />,
    });
    yield ctx.tools.registerVerseTool({
      id: "compare-verses",
      label: "Compare",
      icon: "text_compare",
      priority: 250,
      onSelect: (c) => {
        const [bookId, ch] = c.chapterRef.split(".");
        snapshot.value = {
          chapterRef: c.chapterRef,
          bookId: bookId!,
          chapterNumber: Number(ch),
          verses: c.verses,
        };
        ctx.panes.open("compare");
      },
    });
    yield () => {
      snapshot.value = null;
      ctx.panes.close("compare");
    };
  },
};
export default compare;
