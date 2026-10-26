// THE TOP OF TODAY — the old reader's (packages/seed-bible TodayPane Welcome and Header): for someone with no reading
// yet, the date, "Welcome!" (or "Welcome Ruth"), the opening verse of John in the open translation, and Open Bible,
// Read John 1 and Take a tour; once there is reading, the date and a greeting for the time of day.
import { useEffect, useState } from "preact/hooks";
import type { ChapterVerse } from "../../backend/bible";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { SeedBibleIcon } from "../chrome/icons";

function plain(verse: ChapterVerse): string {
  return verse.content
    .map((c) => (typeof c === "string" ? c : "text" in c ? c.text : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function dateLabel(language: string) {
  const now = new Date();
  return `${now.getDate()} ${now.toLocaleString(language, { month: "short" }).toUpperCase()}`;
}

export function TodayWelcome({
  state,
  hasReading,
}: {
  state: ReaderState;
  hasReading: boolean;
}) {
  const { t, language } = useI18n();
  const { reading } = state;
  const name =
    state.profile.mine.value?.displayName?.trim() ||
    state.session.value?.name?.trim() ||
    "";
  const translationId = reading.translationId.value;
  // John where the translation has it, else its own first book (an Old Testament on its own, say).
  const books = reading.books.value;
  const book = books.find((b) => b.id === "JHN") ?? books[0];
  const [verse, setVerse] = useState("");
  useEffect(() => {
    if (hasReading || !book) return;
    let live = true;
    void state.api
      .getTranslationBookChapter(translationId, book.id, 1)
      .then((ch) => {
        const first = ch.chapter.content.find(
          (c): c is ChapterVerse => c.type === "verse"
        );
        if (live && first) setVerse(plain(first));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hasReading, translationId, book?.id]);

  if (hasReading) {
    const hour = new Date().getHours();
    const greeting =
      hour >= 5 && hour < 12
        ? name
          ? t("greeting-morning-named", {
              name,
              defaultValue: "Good morning, {{name}}!",
            })
          : t("greeting-morning", { defaultValue: "Good morning!" })
        : hour >= 12 && hour < 18
          ? name
            ? t("greeting-afternoon-named", {
                name,
                defaultValue: "Good afternoon, {{name}}!",
              })
            : t("greeting-afternoon", { defaultValue: "Good afternoon!" })
          : hour >= 18 && hour < 21
            ? name
              ? t("greeting-evening-named", {
                  name,
                  defaultValue: "Good evening, {{name}}!",
                })
              : t("greeting-evening", { defaultValue: "Good evening!" })
            : name
              ? t("greeting-night-named", {
                  name,
                  defaultValue: "Good night, {{name}}!",
                })
              : t("greeting-night", { defaultValue: "Good night!" });
    return (
      <div className="sb-today-header">
        <span>{dateLabel(language)}</span>
        <h1>{greeting}</h1>
      </div>
    );
  }

  const open = (bookId: string) =>
    void reading.goTo(translationId, bookId, 1).then(() => {
      state.ui.pane.value = "none";
    });
  return (
    <div className="sb-today-welcome-screen">
      <div className="sb-today-welcome-screen-heading">
        <span className="sb-today-welcome-screen-date">
          {dateLabel(language)}
        </span>
        <h1 className="sb-today-welcome-screen-greeting">
          {name
            ? t("personal-greeting", {
                name,
                defaultValue: "Welcome {{name}}",
              })
            : t("anonymous-greeting", { defaultValue: "Welcome!" })}
        </h1>
      </div>
      {book && verse && (
        <>
          <span className="sb-today-welcome-screen-book sb-today-welcome-screen-passage-visible">
            <span className="sb-today-welcome-screen-reveal">
              {`${book.name.toUpperCase()} 1:1`}
            </span>
          </span>
          <div className="sb-today-welcome-screen-verse sb-today-welcome-screen-passage-visible">
            <div className="sb-today-welcome-screen-reveal">“{verse}”</div>
          </div>
        </>
      )}
      <div className="sb-today-welcome-screen-actions">
        <div className="sb-today-welcome-screen-navigation">
          <button
            className="sb-today-book-selector-button sb-today-clickable"
            type="button"
            onClick={() => (state.ui.selector.value = "books")}
          >
            <SeedBibleIcon size={20} />
            {t("open-bible", { defaultValue: "Open Bible" })}
          </button>
          {book && (
            <button
              className="sb-today-welcome-screen-start-button sb-today-clickable"
              type="button"
              onClick={() => open(book.id)}
            >
              <span className="sb-today-welcome-screen-reveal">
                {t("read-book-chapter-button", {
                  bookName: book.name,
                  chapterNumber: 1,
                  defaultValue: "Read {{bookName}} {{chapterNumber}}",
                })}
                <span className="material-symbols-outlined">
                  arrow_right_alt
                </span>
              </span>
            </button>
          )}
        </div>
        <button
          className="sb-today-welcome-screen-tour-button sb-today-clickable"
          type="button"
          onClick={() => {
            state.ui.pane.value = "none";
            state.tours.start("introduction");
          }}
        >
          {t("take-a-tour", { defaultValue: "Take a tour" })}
        </button>
      </div>
    </div>
  );
}
