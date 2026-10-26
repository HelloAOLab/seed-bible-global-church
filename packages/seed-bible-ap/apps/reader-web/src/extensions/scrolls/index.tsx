// THE DEAD SEA SCROLLS AT A VERSE — the scroll lines whose words fall in the chapter on screen (the selected verses'
// first), in Discover, and a card for each: the line in Hebrew as transcribed, its English first draft, what state that
// draft is in, and whose work it is. The text comes from the publishing gateway through the reader agent's passage
// answer (`/api/passage/<chapter>`), keyed by canonical verse id, under its own licence (non-commercial, attribution
// required); it is shown, never stored apart from that answer.
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import type { DiscoverItem, ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  chapterStartOf,
  loadPassage,
  refForSelection,
  type PassageItem,
} from "../../state/passage";
import "./scrolls.css";

/** The line whose card is open. */
const open = signal<PassageItem | null>(null);

/** `GEN.1.1-GEN.1.2` → `Genesis 1:1–2`. */
export function verseLabel(
  ref: string,
  bookName: (id: string) => string
): string {
  const [a, b] = ref.split("-");
  const [book, ch, v] = a!.split(".");
  const head = `${bookName(book!)} ${ch}${v ? `:${v}` : ""}`;
  if (!b) return head;
  const [, ch2, v2] = b.split(".");
  return ch2 === ch ? `${head}–${v2}` : `${head}–${ch2}:${v2}`;
}

/** `4Q7 — 4Q Genesis` and `4Q7 f1:1` → `4Q Genesis (4Q7)` and `f1:1`: the scroll by its name, the line without the
 *  siglum said twice. */
export function scrollName(manuscript: string, line: string) {
  const [siglum, name] = manuscript.split(/\s+—\s+/);
  const scroll = name && siglum ? `${name} (${siglum})` : manuscript;
  const short =
    siglum && line.startsWith(`${siglum} `)
      ? line.slice(siglum.length + 1)
      : line;
  return { scroll, line: short };
}

/** A quoting scroll by the work it is part of: `1QS — 1Q Community Rule` with `Community Rule` → `Community Rule — 1QS`
 *  as a manuscript name (`<siglum> — <name>`), so it reads "Community Rule (1QS)". */
export function quoteName(manuscript: string, composition: string): string {
  if (!composition) return manuscript;
  const siglum = manuscript.split(/\s+—\s+/)[0] ?? manuscript;
  return `${siglum} — ${composition}`;
}

/** How a quotation was found, plainly: by computer, and how often such a match is right (from the source's measured
 *  precision, e.g. "precision 0.9888" → about 99 in 100). */
export function foundByWords(
  foundBy: string | null | undefined
): string | null {
  if (!foundBy) return null;
  const p = /precision\s+(0?\.\d+)/i.exec(foundBy);
  const per100 = p ? Math.round(Number(p[1]) * 100) : null;
  return per100
    ? `Found by a computer matching the scroll's words to the verse — right about ${per100} times in 100.`
    : "Found by a computer matching the scroll's words to the verse.";
}

/** The draft's state in plain words: `first-draft · human-pending` → `First draft, waiting for a person to check it`. */
export function plainStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const words: Record<string, string> = {
    "first-draft": "First draft",
    "human-pending": "waiting for a person to check it",
    "human-reviewed": "checked by a person",
    reviewed: "checked by a person",
  };
  const parts = status
    .split("·")
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith("condition:") && !p.startsWith("notes:"));
  const said = parts.map((p) => words[p] ?? p.replace(/-/g, " "));
  return said.length ? said.join(", ") : null;
}

/** The scroll lines at the selected verses (or the whole chapter), in verse order. */
export function scrollLinesFor(
  items: PassageItem[],
  chapterSpanStart: number,
  selectedVerses: number[]
): PassageItem[] {
  const base = chapterSpanStart - 1;
  const wanted = selectedVerses.map((v) => base + v);
  return items
    .filter((i) => i.kind === "scroll-line" || i.kind === "scroll-quote")
    .filter(
      (i) =>
        !wanted.length ||
        wanted.some((o) => o >= i.locus.span[0] && o <= i.locus.span[1])
    )
    .sort(
      (a, b) =>
        a.locus.span[0] - b.locus.span[0] || a.title.localeCompare(b.title)
    );
}

function Card({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const it = open.value;
  // A line named in a chapter's answer comes without its text: the verse it is at is asked, and the line taken from there.
  const textAt =
    it && typeof it.data?.["textAt"] === "string" && !it.data?.["hebrew"]
      ? (it.data["textAt"] as string)
      : null;
  const [unreadable, setUnreadable] = useState(false);
  useEffect(() => {
    if (!textAt || !it) return;
    setUnreadable(false);
    let live = true;
    void loadPassage(textAt, state.stores.chapters)
      .then((a) => {
        if (!live) return;
        const full = a?.items.find(
          (x) =>
            x.kind === it.kind &&
            x.title === it.title &&
            x.data?.["hebrew"] !== undefined
        );
        if (full) open.value = full;
        else setUnreadable(true);
      })
      .catch(() => live && setUnreadable(true));
    return () => {
      live = false;
    };
  }, [textAt]);
  if (it && textAt)
    return (
      <p className="sb-pane-empty">
        {unreadable
          ? t("scrolls-line-unreadable", {
              defaultValue: "This line could not be read just now.",
            })
          : t("scrolls-line-loading", { defaultValue: "Reading the line…" })}
      </p>
    );
  if (!it)
    return (
      <p className="sb-pane-empty">
        {t("scrolls-empty", {
          defaultValue: "Open a Dead Sea Scroll line from Discover.",
        })}
      </p>
    );
  const d = (it.data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  const bookName = (id: string) =>
    state.reading.books.value.find((b) => b.id === id)?.name ?? id;
  const status = plainStatus(str("status"));
  const named = scrollName(
    quoteName(str("manuscript") || str("work"), str("composition")),
    it.title
  );
  const quotes = it.kind === "scroll-quote";
  const reconstructed = /reconstructed|uncertain/i.test(str("status"));
  return (
    <div className="sb-scroll-card">
      <p className="sb-small sb-muted">
        {named.scroll} · {t("scrolls-line", { defaultValue: "line" })}{" "}
        {named.line}
      </p>
      <h3 className="sb-scroll-verses">
        {quotes
          ? t("scrolls-quotes", {
              ref: verseLabel(it.locus.ref, bookName),
              defaultValue: "Quotes {{ref}}",
            })
          : verseLabel(it.locus.ref, bookName)}
      </h3>
      {it.source === "publishing" ? (
        <>
          {quotes && str("composition") && (
            <p className="sb-small">
              {t("scrolls-quote-from", {
                work: str("composition"),
                defaultValue:
                  "A line from the {{work}}, a writing of the time that is not part of the Bible, quoting this verse.",
              })}
            </p>
          )}
          {quotes && foundByWords(str("foundBy")) && (
            <p className="sb-small sb-muted sb-scroll-found">
              {foundByWords(str("foundBy"))}
            </p>
          )}
          <p className="sb-scroll-hebrew" lang="he" dir="rtl">
            {str("hebrew")}
          </p>
          <p className="sb-small sb-muted sb-scroll-marks">
            {t("scrolls-marks", {
              defaultValue:
                "Square brackets mark letters restored where the scroll is damaged.",
            })}
          </p>
          <h4 className="sb-scroll-subhead">
            {t("scrolls-english", { defaultValue: "English first draft" })}
          </h4>
          <p className="sb-scroll-english">{str("english")}</p>
          {status && (
            <p className="sb-small sb-scroll-status">
              {status}
              {reconstructed
                ? ` · ${t("scrolls-uncertain", { defaultValue: "partly restored and uncertain" })}`
                : ""}
            </p>
          )}
          {it.link && (
            <a
              className="sb-note-button sb-scroll-source"
              href={it.link}
              target="_blank"
              rel="noreferrer"
            >
              {t("scrolls-see-publisher", {
                defaultValue: "See it at the publisher",
              })}
            </a>
          )}
          <p className="sb-small sb-muted sb-scroll-credit">
            {str("attribution")}
            {d["commercialUse"] === false && (
              <>
                {" "}
                {t("scrolls-study-only", {
                  defaultValue: "For study only, not for commercial use.",
                })}
              </>
            )}
          </p>
        </>
      ) : (
        <p className="sb-small">
          {t("scrolls-not-published", {
            defaultValue:
              "This scroll has a line here, but its text is not published yet.",
          })}
        </p>
      )}
    </div>
  );
}

const scrolls: ExtensionRegistration = {
  id: "scrolls",
  label: "Dead Sea Scrolls",
  description:
    "The Dead Sea Scroll lines at the verses on screen — Hebrew and an English draft — in Discover.",
  init: function* (ctx) {
    const state: ReaderState = ctx.state;
    yield ctx.panes.register({
      id: "scrolls",
      title: "Dead Sea Scrolls",
      render: () => <Card state={state} />,
    });
    yield ctx.discover.registerProvider({
      id: "scrolls",
      label: "Dead Sea Scrolls",
      discover: async (d): Promise<DiscoverItem[]> => {
        const answer = await loadPassage(
          refForSelection(d.chapterRef, d.selectedVerses),
          state.stores.chapters
        ).catch(() => null);
        if (!answer) return [];
        const bookName = (id: string) =>
          d.books.find((b) => b.id === id)?.name ?? id;
        return scrollLinesFor(
          answer.items,
          chapterStartOf(answer),
          d.selectedVerses
        ).map((it) => {
          const data = (it.data ?? {}) as Record<string, unknown>;
          const manuscript = quoteName(
            typeof data["manuscript"] === "string"
              ? (data["manuscript"] as string)
              : it.title,
            typeof data["composition"] === "string"
              ? (data["composition"] as string)
              : ""
          );
          const quotes = it.kind === "scroll-quote";
          const verses = verseLabel(it.locus.ref, bookName);
          return {
            id: `${it.source}:${it.kind}:${it.title}`,
            title: (() => {
              const n = scrollName(manuscript, it.title);
              return `${n.scroll} · ${n.line}`;
            })(),
            description: `${quotes ? `quotes ${verses}` : verses}${it.detail ? ` — ${it.detail}` : ""}`,
            icon: quotes ? "format_quote" : "history_edu",
            // Copies of the verse, and other writings of the time that quote it — two different kinds of witness.
            section: quotes
              ? "Quoted in other writings"
              : "Copies of this verse",
            onOpen: () => {
              open.value = it;
              ctx.panes.open("scrolls");
            },
          };
        });
      },
    });
    yield () => {
      open.value = null;
    };
  },
};

export default scrolls;
