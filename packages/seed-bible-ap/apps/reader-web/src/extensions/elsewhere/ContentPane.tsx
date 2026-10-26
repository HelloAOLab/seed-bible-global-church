// A VERSE'S CONTENT, IN ONE PLACE — what the verse bar's Content opens: for the verse tapped (several selected: buttons
// to switch), the Dead Sea Scroll lines that copy it and those of other writings that quote it (Hebrew and the English
// draft, each linked to the publisher), where the New Testament quotes it and its parallel passages (each opens in the
// reader), and the verse in Greek; then its interpretations and the writings around the chapter, and whose each source
// is. From the reader agent's passage answer for that verse, which carries the scroll lines' text.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  loadPassage,
  type PassageAnswer,
  type PassageItem,
} from "../../state/passage";
import {
  foundByWords,
  plainStatus,
  quoteName,
  scrollName,
  verseLabel,
} from "../scrolls";
import { relationSection } from ".";
import { interpretationsFor } from "../interpretations";

/** The verses Content was opened for (the selection at that moment). */
export const contentVerses = signal<number[]>([]);

/** The kinds of item that are a verse's content. */
export const CONTENT_KINDS = new Set([
  "scroll-line",
  "scroll-quote",
  "parallel",
  "septuagint",
]);

function ScrollLine({
  it,
  verses,
}: {
  it: PassageItem;
  /** The verses this line holds, said plainly ("Genesis 1:2–3"), when it holds more than the one asked for. */
  verses?: string | null;
}) {
  const { t } = useI18n();
  const d = (it.data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const named = scrollName(
    quoteName(str("manuscript") || str("work"), str("composition")),
    it.title
  );
  const status = plainStatus(str("status"));
  return (
    <li className="sb-content-line">
      <p className="sb-content-line-name">
        {named.scroll} · {named.line}
      </p>
      {verses && (
        <p className="sb-small sb-content-line-verses">
          {t("content-line-holds", {
            verses,
            defaultValue: "This line holds {{verses}}",
          })}
        </p>
      )}
      {str("hebrew") ? (
        <>
          <p className="sb-content-line-hebrew" lang="he" dir="rtl">
            {str("hebrew")}
          </p>
          <p className="sb-content-line-english">{str("english")}</p>
          <p className="sb-small sb-muted">
            {[
              status,
              it.kind === "scroll-quote" ? foundByWords(str("foundBy")) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {it.link && (
              <>
                {" "}
                <a href={it.link} target="_blank" rel="noreferrer">
                  {t("scrolls-see-publisher", {
                    defaultValue: "See it at the publisher",
                  })}
                </a>
              </>
            )}
          </p>
        </>
      ) : (
        <p className="sb-small sb-muted">
          {t("scrolls-not-published", {
            defaultValue:
              "This scroll has a line here, but its text is not published yet.",
          })}
        </p>
      )}
    </li>
  );
}

function Section(props: {
  id: string;
  title: string;
  children: preact.ComponentChildren;
}) {
  return (
    <section className="sb-content-section-v" id={props.id}>
      <h4 className="sb-content-section-v-title">{props.title}</h4>
      {props.children}
    </section>
  );
}

export function ContentPane({
  state,
  openPane,
}: {
  state: ReaderState;
  openPane: (id: string) => void;
}) {
  const { t } = useI18n();
  const chapterRef = state.reading.chapterRef.value;
  const verses = contentVerses.value;
  const [shown, setShown] = useState<number | null>(null);
  const verse = verses.includes(shown ?? -1) ? shown! : verses[0];
  const [answer, setAnswer] = useState<PassageAnswer | null | undefined>(
    undefined
  );
  const [interpreted, setInterpreted] = useState(false);
  const [allCopies, setAllCopies] = useState(false);
  useEffect(() => setShown(null), [verses.join(",")]);
  useEffect(() => setAllCopies(false), [verse]);
  useEffect(() => {
    if (!verse) return;
    let live = true;
    setInterpreted(false);
    const [bookId, ch] = chapterRef.split(".");
    void interpretationsFor(
      state.reading.translationId.value,
      bookId!,
      Number(ch),
      state.stores.chapters
    )
      .then(
        (f) =>
          live &&
          setInterpreted(!!f?.data.verses.some((v) => v.verse === verse))
      )
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [chapterRef, verse]);
  useEffect(() => {
    if (!verse) return;
    let live = true;
    setAnswer(undefined);
    void loadPassage(`${chapterRef}.${verse}`, state.stores.chapters)
      .then((a) => live && setAnswer(a))
      .catch(() => live && setAnswer(null));
    return () => {
      live = false;
    };
  }, [chapterRef, verse]);
  if (!verse)
    return (
      <p className="sb-pane-empty">
        {t("content-empty", {
          defaultValue: "Tap a verse, then Content on its bar.",
        })}
      </p>
    );
  const bookName = (id: string) =>
    state.reading.books.value.find((b) => b.id === id)?.name ?? id;
  const ref = `${state.reading.bookName.value} ${state.reading.chapterNumber.value}:${verse}`;
  const items = (answer?.items ?? []).filter((i) => CONTENT_KINDS.has(i.kind));
  const of = (kind: string) => items.filter((i) => i.kind === kind);
  // The lines that start at this verse first; then those that run into it from the verse before.
  const copies = of("scroll-line").sort(
    (a, b) =>
      Number(a.locus.span[0] < (answer?.locus.span[0] ?? 0)) -
        Number(b.locus.span[0] < (answer?.locus.span[0] ?? 0)) ||
      a.locus.span[0] - b.locus.span[0]
  );
  /** The verses a line holds, when it holds more than this one verse. */
  const holds = (it: PassageItem) =>
    it.locus.span[0] === it.locus.span[1]
      ? null
      : verseLabel(it.locus.ref, bookName);
  const quotes = of("scroll-quote");
  const parallels = of("parallel");
  const greek = of("septuagint")[0];
  const byRelation = (section: string) =>
    parallels.filter((p) => relationSection(p.data?.["relation"]) === section);
  const goTo = (p: PassageItem) => {
    const to = p.data?.["to"] as { ref: string } | undefined;
    const [book, ch, v] = (to?.ref ?? "").split("-")[0]!.split(".");
    if (!book || !ch) return;
    void state.reading
      .goTo(state.reading.translationId.value, book, Number(ch))
      .then(() => v && state.selection.select(Number(v), Number(v)));
  };
  return (
    <div className="sb-content-pane">
      {verses.length > 1 && (
        <nav className="sb-interp-verse-picker">
          {verses.map((v) => (
            <button
              key={v}
              type="button"
              className={`sb-discover-chip${v === verse ? " sb-discover-chip--on" : ""}`}
              aria-pressed={v === verse}
              onClick={() => setShown(v)}
            >
              {state.reading.bookName.value} {state.reading.chapterNumber.value}
              :{v}
            </button>
          ))}
        </nav>
      )}
      <h3 className="sb-content-pane-title">
        {t("content-at", { ref, defaultValue: "Content for {{ref}}" })}
      </h3>
      {items.length > 0 && (
        <nav
          className="sb-content-summary"
          aria-label={t("content-on-this-verse", {
            defaultValue: "On this verse",
          })}
        >
          {[
            copies.length
              ? [
                  "sb-content-copies",
                  t("content-n-copies", {
                    count: copies.length,
                    defaultValue: "{{count}} in the scrolls",
                  }),
                ]
              : null,
            quotes.length
              ? [
                  "sb-content-quoted",
                  t("content-n-quoted", {
                    count: quotes.length,
                    defaultValue: "{{count}} quoted in other writings",
                  }),
                ]
              : null,
            byRelation("Quoted in the New Testament").length
              ? [
                  "sb-content-nt",
                  t("content-n-nt", {
                    count: byRelation("Quoted in the New Testament").length,
                    defaultValue: "{{count}} in the New Testament",
                  }),
                ]
              : null,
            byRelation("Parallel passages").length
              ? [
                  "sb-content-parallels",
                  t("content-n-parallels", {
                    count: byRelation("Parallel passages").length,
                    defaultValue: "{{count}} parallel passages",
                  }),
                ]
              : null,
            greek
              ? [
                  "sb-content-greek",
                  t("content-greek-short", { defaultValue: "Greek" }),
                ]
              : null,
          ]
            .filter((x): x is [string, string] => x !== null)
            .map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="sb-discover-chip"
                onClick={() =>
                  document
                    .getElementById(id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {label}
              </button>
            ))}
        </nav>
      )}
      {answer === undefined && (
        <p className="sb-muted sb-small">
          {t("loading", { defaultValue: "Loading…" })}
        </p>
      )}
      {answer === null && (
        <p className="sb-muted sb-small">
          {t("content-unreadable", {
            defaultValue: "This verse's content could not be read just now.",
          })}
        </p>
      )}
      {answer && !items.length && (
        <p className="sb-muted sb-small">
          {t("content-none", {
            defaultValue: "Nothing more is known for this verse yet.",
          })}
        </p>
      )}
      {copies.length > 0 && (
        <Section
          id="sb-content-copies"
          title={t("content-copies", {
            defaultValue: "In the Dead Sea Scrolls",
          })}
        >
          <p className="sb-small sb-muted">
            {t("content-copies-what", {
              defaultValue:
                "Copies of this verse among the scrolls found near the Dead Sea, made before and around Jesus' time. A scroll's lines don't start where verses start, so a line can hold the end of the verse before or the start of the next.",
            })}
          </p>
          <ul className="sb-content-lines">
            {(allCopies ? copies : copies.slice(0, 3)).map((it) => (
              <ScrollLine key={`${it.title}`} it={it} verses={holds(it)} />
            ))}
          </ul>
          {copies.length > 3 && (
            <button
              type="button"
              className="sb-content-see-all sb-discover-show-all"
              onClick={() => setAllCopies(!allCopies)}
            >
              {allCopies
                ? t("show-fewer", { defaultValue: "Show fewer" })
                : t("show-all-count", {
                    count: copies.length,
                    defaultValue: "Show all {{count}}",
                  })}
            </button>
          )}
        </Section>
      )}
      {quotes.length > 0 && (
        <Section
          id="sb-content-quoted"
          title={t("content-quoted", {
            defaultValue: "Quoted in other writings",
          })}
        >
          <p className="sb-small sb-muted">
            {t("content-quoted-what", {
              defaultValue:
                "Lines of other writings of that time, not part of the Bible, that quote this verse.",
            })}
          </p>
          <ul className="sb-content-lines">
            {quotes.map((it) => (
              <ScrollLine key={it.title} it={it} verses={holds(it)} />
            ))}
          </ul>
        </Section>
      )}
      {["Quoted in the New Testament", "Parallel passages"].map((section) =>
        byRelation(section).length ? (
          <Section
            key={section}
            id={
              section === "Quoted in the New Testament"
                ? "sb-content-nt"
                : "sb-content-parallels"
            }
            title={
              section === "Quoted in the New Testament"
                ? t("content-in-nt", {
                    defaultValue: "Quoted in the New Testament",
                  })
                : t("content-parallels", { defaultValue: "Parallel passages" })
            }
          >
            <div className="sb-content-links">
              {byRelation(section).map((p) => (
                <button
                  key={p.title}
                  type="button"
                  className="sb-note-button"
                  onClick={() => goTo(p)}
                >
                  {verseLabel(
                    (p.data?.["to"] as { ref: string } | undefined)?.ref ??
                      p.title,
                    bookName
                  )}
                </button>
              ))}
            </div>
          </Section>
        ) : null
      )}
      {greek && (
        <Section
          id="sb-content-greek"
          title={t("content-greek", {
            defaultValue: "In Greek (the Septuagint)",
          })}
        >
          <p className="sb-greek-text" lang="grc">
            {greek.detail}
          </p>
        </Section>
      )}
      {answer && (
        <div className="sb-content-more">
          {interpreted && (
            <>
              <button
                type="button"
                className="sb-discover-create-link"
                onClick={() => {
                  state.selection.select(verse, verse);
                  openPane("interpretations");
                }}
              >
                {t("content-interpretations", {
                  defaultValue: "How this verse is interpreted",
                })}
              </button>
              {" · "}
            </>
          )}
          <button
            type="button"
            className="sb-discover-create-link"
            onClick={() => openPane("writings")}
          >
            {t("content-writings", {
              defaultValue: "Writings around this chapter",
            })}
          </button>
        </div>
      )}
      {items.length > 0 && (
        <p className="sb-small sb-muted sb-content-credits">
          {[
            copies.length || quotes.length
              ? "Scroll transcriptions: ETCBC/dss; English first drafts: Open Dead Sea — CC BY-NC 4.0, for study only."
              : "",
            parallels.length
              ? "Parallel passages: United Bible Societies, CC BY-SA 4.0."
              : "",
            greek
              ? "Septuagint: ed. H. B. Swete (1909–1930), public domain."
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
      )}
    </div>
  );
}
