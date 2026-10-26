// ELSEWHERE, AT THIS VERSE — what bears on a verse from outside the translation being read: where the New Testament
// quotes it and the passages that run parallel to it (UBS parallel passages), and the verse in Greek as the
// Septuagint has it (Swete's edition, public domain). From the reader agent's passage answer (the Scripture Agent's
// verse-associations), the selected verses' first. A passage opens in the reader; the Greek opens in a small card.
import { signal } from "@preact/signals";
import type { DiscoverItem, ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  chapterStartOf,
  loadPassage,
  type PassageItem,
} from "../../state/passage";
import { verseLabel } from "../scrolls";
import { CONTENT_KINDS, ContentPane, contentVerses } from "./ContentPane";
import "./elsewhere.css";

/** The Greek verse whose card is open. */
const greek = signal<PassageItem | null>(null);

/** Where a parallel passage is listed: what it is to the verse, in plain words. */
export function relationSection(relation: unknown): string {
  return relation === "ot-in-nt"
    ? "Quoted in the New Testament"
    : "Parallel passages";
}

/** The parallels and the Greek at the selected verses (or the whole chapter), parallels first. */
export function elsewhereFor(
  items: PassageItem[],
  chapterSpanStart: number,
  selectedVerses: number[]
): PassageItem[] {
  const base = chapterSpanStart - 1;
  const wanted = selectedVerses.map((v) => base + v);
  const at = (i: PassageItem) =>
    !wanted.length ||
    wanted.some((o) => o >= i.locus.span[0] && o <= i.locus.span[1]);
  const pick = (kind: string) =>
    items
      .filter((i) => i.kind === kind && at(i))
      .sort((a, b) => a.locus.span[0] - b.locus.span[0]);
  return [...pick("parallel"), ...pick("septuagint")];
}

function GreekCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const it = greek.value;
  if (!it)
    return (
      <p className="sb-pane-empty">
        {t("elsewhere-greek-empty", {
          defaultValue: "Open a verse's Greek from Discover → Elsewhere.",
        })}
      </p>
    );
  const label = (it.data?.["label"] as string | undefined) ?? "";
  const bookName = (id: string) =>
    state.reading.books.value.find((b) => b.id === id)?.name ?? id;
  return (
    <div className="sb-greek-card">
      <h3 className="sb-greek-verse">
        {verseLabel(it.locus.ref, bookName)}{" "}
        <span className="sb-small sb-muted">
          {t("elsewhere-in-greek", { defaultValue: "in Greek" })}
        </span>
      </h3>
      <p className="sb-greek-text" lang="grc">
        {it.detail}
      </p>
      <p className="sb-small sb-muted">
        {t("elsewhere-greek-what", {
          defaultValue:
            "The Septuagint is the Greek translation of the Hebrew Scriptures made before Jesus' time — the Bible the New Testament writers often quote.",
        })}
      </p>
      {label && <p className="sb-small sb-muted sb-greek-credit">{label}</p>}
    </div>
  );
}

const elsewhere: ExtensionRegistration = {
  id: "elsewhere",
  label: "Elsewhere",
  description:
    "Where the New Testament quotes a verse, the passages parallel to it, and the verse in Greek (the Septuagint) — in Discover.",
  init: function* (ctx) {
    const state: ReaderState = ctx.state;
    yield ctx.panes.register({
      id: "greek",
      title: "In Greek",
      render: () => <GreekCard state={state} />,
    });
    yield ctx.panes.register({
      id: "content",
      title: "Content",
      render: () => <ContentPane state={state} openPane={ctx.panes.open} />,
    });
    // Which verses of a chapter have content (scroll lines, quotations, parallels, Greek), read from the chapter's
    // answer the first time the verse bar is drawn there — the bar offers Content exactly where there is some.
    const withContent = signal<{ key: string; verses: ReadonlySet<number> }>({
      key: "",
      verses: new Set(),
    });
    let asked = "";
    const contentAt = (chapterRef: string): ReadonlySet<number> => {
      if (withContent.value.key === chapterRef) return withContent.value.verses;
      if (asked !== chapterRef) {
        asked = chapterRef;
        void loadPassage(chapterRef, state.stores.chapters)
          .then((a) => {
            if (!a) return;
            const start = chapterStartOf(a);
            const verses = new Set<number>();
            for (const i of a.items)
              if (CONTENT_KINDS.has(i.kind))
                for (let o = i.locus.span[0]; o <= i.locus.span[1]; o++)
                  verses.add(o - start + 1);
            withContent.value = { key: chapterRef, verses };
          })
          .catch(() => undefined);
      }
      return new Set();
    };
    yield ctx.tools.registerVerseTool({
      id: "content",
      label: "Content",
      icon: "library_books",
      priority: 50,
      isVisible: (v) => {
        const at = contentAt(v.chapterRef);
        return v.verses.some((n) => at.has(n));
      },
      onSelect: (v) => {
        contentVerses.value = v.verses.filter((n) =>
          withContent.value.verses.has(n)
        );
        ctx.panes.open("content");
      },
    });
    yield ctx.discover.registerProvider({
      id: "elsewhere",
      label: "Elsewhere in the Bible",
      discover: async (d): Promise<DiscoverItem[]> => {
        const answer = await loadPassage(
          d.chapterRef,
          state.stores.chapters
        ).catch(() => null);
        if (!answer) return [];
        const bookName = (id: string) =>
          d.books.find((b) => b.id === id)?.name ?? id;
        return elsewhereFor(
          answer.items,
          answer.locus.span[0],
          d.selectedVerses
        ).map((it) => {
          const from = verseLabel(it.locus.ref, bookName);
          if (it.kind === "septuagint")
            return {
              id: `greek:${it.locus.ref}`,
              title: `${from} in Greek`,
              description: it.detail ?? "",
              icon: "translate",
              section: "In Greek (Septuagint)",
              onOpen: () => {
                greek.value = it;
                ctx.panes.open("greek");
              },
            };
          const to = it.data?.["to"] as { ref: string } | undefined;
          const [book, ch, v] = (to?.ref ?? "").split("-")[0]!.split(".");
          return {
            id: `parallel:${it.locus.ref}:${to?.ref}`,
            title: to ? verseLabel(to.ref, bookName) : it.title,
            description: `from ${from}`,
            icon: "call_split",
            section: relationSection(it.data?.["relation"]),
            onOpen: () => {
              if (!book || !ch) return;
              void state.reading
                .goTo(state.reading.translationId.value, book, Number(ch))
                .then(() => {
                  if (v) state.selection.select(Number(v), Number(v));
                });
            },
          };
        });
      },
    });
    yield () => {
      greek.value = null;
    };
  },
};

export default elsewhere;
