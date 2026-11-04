// THE VERSE OF THE DAY — seedbible.org's Today section (TodayPane/VerseOfTheDaySection.tsx, its markup and classes):
// the day's verse from the Bible API's open verse-of-the-day dataset, picked as seedbible.org picks it (same date, same
// verse), in the translation open, with its reference opening the passage. Hidden when there is none to show.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import type { ChapterVerse } from "../../backend/bible";
import { plain } from "./TodayWelcome";

interface Shown {
  book: string;
  chapter: number;
  verse: number;
  endVerse?: number;
  text: string;
  translation: string;
}

/** The local calendar date as `YYYY-MM-DD`, the form the verse is picked by. */
export function localDateKey(time: number): string {
  const d = new Date(time);
  return [
    String(d.getFullYear()).padStart(4, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function VerseOfTheDay({
  state,
  onOpen,
}: {
  state: ReaderState;
  onOpen: (chapter: string, start: number, end: number) => void;
}) {
  const { t } = useI18n();
  const translationId = state.reading.translationId.value;
  const date = localDateKey(Date.now());
  const [shown, setShown] = useState<Shown | null | "loading">("loading");

  useEffect(() => {
    let live = true;
    setShown("loading");
    void (async () => {
      const picked = await state.api.getVerseOfTheDay?.(date);
      if (!picked) return null;
      const ch = await state.api.getTranslationBookChapter(
        translationId,
        picked.book,
        picked.chapter
      );
      const last = picked.endVerse ?? picked.verse;
      const text = ch.chapter.content
        .filter(
          (c): c is ChapterVerse =>
            c.type === "verse" && c.number >= picked.verse && c.number <= last
        )
        .map(plain)
        .join(" ");
      if (!text) return null;
      return {
        book: picked.book,
        chapter: picked.chapter,
        verse: picked.verse,
        ...(picked.endVerse !== undefined ? { endVerse: picked.endVerse } : {}),
        text,
        translation: ch.translation.shortName || translationId,
      };
    })()
      .then((v) => live && setShown(v))
      .catch(() => live && setShown(null));
    return () => {
      live = false;
    };
  }, [date, translationId]);

  if (!shown) return null;
  const title = t("verse-of-the-day", { defaultValue: "VERSE OF THE DAY" });
  if (shown === "loading")
    return (
      <div className="sb-today-titled-section">
        <div className="sb-today-titled-section-header">
          <h5>{title}</h5>
        </div>
        <div
          className="sb-today-verse-of-the-day-card"
          aria-busy="true"
          aria-label={t("verse-of-the-day-loading", {
            defaultValue: "Loading the verse of the day…",
          })}
        />
      </div>
    );
  const bookName =
    state.reading.books.value.find((b) => b.id === shown.book)?.name ??
    shown.book;
  const reference = `${bookName} ${shown.chapter}:${shown.verse}${shown.endVerse !== undefined ? `–${shown.endVerse}` : ""}`;
  return (
    <div className="sb-today-titled-section">
      <div className="sb-today-titled-section-header">
        <h5>{title}</h5>
      </div>
      {/* Only the reference is a button, so the verse itself stays copyable (as on seedbible.org). */}
      <div className="sb-today-verse-of-the-day-card">
        <blockquote className="sb-today-verse-of-the-day-text">
          {shown.text}
        </blockquote>
        <button
          type="button"
          className="sb-today-verse-of-the-day-reference sb-today-clickable"
          onClick={() =>
            onOpen(
              `${shown.book}.${shown.chapter}`,
              shown.verse,
              shown.endVerse ?? shown.verse
            )
          }
        >
          <span dir="auto">{reference}</span>
          <span aria-hidden="true">•</span>
          <span className="sb-today-verse-of-the-day-translation">
            {shown.translation}
          </span>
          <span className="material-symbols-outlined">arrow_right_alt</span>
        </button>
      </div>
    </div>
  );
}
