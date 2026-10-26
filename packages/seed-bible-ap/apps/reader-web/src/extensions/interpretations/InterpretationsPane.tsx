// THE INTERPRETATIONS PANE — the full record the Scripture Agent serves for the chapter on screen: per verse that carries one, the
// questions (status first), the reading this translation chose with the note it owes the reader, the alternatives it kept, the
// writings consulted (by work, with the cited quotes where the edition allows one) and the story paths. The selected verses come
// first. Each verse links to the translation workbench, where the evidence is read in full and a reviewer proposes.
import { useEffect, useState } from "preact/hooks";
import { signal } from "@preact/signals";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  interpretationsFor,
  statusWords,
  WORKBENCH_URL,
  type ChapterInterpretations,
  type InterpretationQuestion,
  type InterpretationPath,
  type InterpretedVerse,
} from "./index";
import { isDraft, namedReaders, plainQuestion, translatorsNote } from "./plain";

const words = (s: string | null | undefined) => (s ?? "").replace(/-/g, " ");

function Question({ q }: { q: InterpretationQuestion }) {
  const [more, setMore] = useState(false);
  const chosen = q.candidates.find((c) => c.role === "chosen");
  const others = q.candidates.filter((c) => c.role !== "chosen");
  return (
    <div
      className={`sb-interp-question${q.decided ? "" : " sb-interp-question--open"}`}
    >
      <div className="sb-interp-question-head">
        <span className="material-symbols-outlined sb-interp-icon">
          {q.decided ? "fact_check" : "help"}
        </span>
        <div>
          <div className="sb-interp-question-text">{q.text}</div>
          <div className="sb-interp-meta">
            {words(q.kind)} · {statusWords(q.status)}
          </div>
        </div>
      </div>
      {q.decided && (
        <div className="sb-interp-decided">
          <div>
            <b>This edition reads:</b>{" "}
            {chosen?.reading ?? q.decided.reading ?? q.decided.candidate}
            {q.decided.origin && (
              <span className="sb-interp-tag">{words(q.decided.origin)}</span>
            )}
          </div>
          {q.decided.rationale && (
            <p className="sb-interp-p">{q.decided.rationale}</p>
          )}
          {q.decided.footnote && (
            <p className="sb-interp-p sb-interp-footnote">
              <span className="material-symbols-outlined sb-interp-icon-sm">
                info
              </span>{" "}
              {q.decided.footnote}
            </p>
          )}
          {q.decided.circularityFlag && (
            <p className="sb-interp-p sb-interp-caution">
              A candidate's support rests on the rendering it would produce —
              read the evidence with that in mind.
            </p>
          )}
        </div>
      )}
      {others.length > 0 && (
        <div className="sb-interp-alternatives">
          <b>{q.decided ? "Alternatives kept" : "Readings on record"}</b>
          <ul>
            {others.map((c) => (
              <li key={c.id}>
                {c.reading}{" "}
                <span className="sb-interp-tag">{words(c.origin)}</span>
                {c.registerEntry && (
                  <span className="sb-interp-tag">{c.registerEntry}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {q.writings.total > 0 && (
        <div className="sb-interp-writings">
          <button
            type="button"
            className="sb-interp-more"
            onClick={() => setMore(!more)}
          >
            {more ? "Hide" : "Show"} the writings behind it (
            {q.writings.consulted.length} work
            {q.writings.consulted.length === 1 ? "" : "s"}, {q.writings.total}{" "}
            claim{q.writings.total === 1 ? "" : "s"})
          </button>
          {more && (
            <div>
              <ul className="sb-interp-works">
                {q.writings.consulted.map((w) => (
                  <li key={w.work}>
                    <b>{w.work}</b>
                    {w.authorDate ? ` · ${w.authorDate}` : ""} · {w.claims}{" "}
                    claim{w.claims === 1 ? "" : "s"}
                    {Object.keys(w.stances).length > 0 && (
                      <span className="sb-interp-meta">
                        {" "}
                        ·{" "}
                        {Object.entries(w.stances)
                          .map(([s, n]) => `${s} ${n}`)
                          .join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {q.writings.cited.length > 0 && (
                <div className="sb-interp-cited">
                  {q.writings.cited.map((c) => (
                    <blockquote key={c.id} className="sb-interp-quote">
                      {c.quote ? (
                        <p>“{c.quote}”</p>
                      ) : c.says ? (
                        <p>{c.says}</p>
                      ) : null}
                      <footer>
                        {c.source}
                        {c.authorDate ? ` · ${c.authorDate}` : ""}
                        {c.stance ? ` · ${c.stance}` : ""}
                        {c.informedDecision ? " · informed the decision" : ""}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              )}
              {q.writings.note && (
                <p className="sb-interp-meta">{q.writings.note}</p>
              )}
            </div>
          )}
        </div>
      )}
      {q.compatibility.length > 0 && (
        <div className="sb-interp-meta">
          Compatibility:{" "}
          {q.compatibility
            .map((c) => `${c.between.join(" ↔ ")}: ${words(c.state)}`)
            .join("; ")}
        </div>
      )}
    </div>
  );
}

function Path({ p }: { p: InterpretationPath }) {
  return (
    <div className="sb-interp-path">
      <div className="sb-interp-question-head">
        <span className="material-symbols-outlined sb-interp-icon">
          alt_route
        </span>
        <div>
          <div className="sb-interp-question-text">
            {p.id.replace(/^path[-:]/, "").replace(/-/g, " ")}
          </div>
          <div className="sb-interp-meta">
            {words(p.origin)}
            {p.attributedTo
              ? ` · ${p.attributedTo}`
              : " · names no ancient author"}{" "}
            · {words(p.reviewStatus)} ·{" "}
            {p.materialEffect === "none"
              ? "changes no rendering"
              : `changes: ${words(p.materialEffect)}`}
          </div>
        </div>
      </div>
      {p.choices.length > 0 && (
        <ul>
          {p.choices.map((c, i) => (
            <li key={i}>
              {words(c.question)} → <b>{c.chooses}</b>
            </li>
          ))}
        </ul>
      )}
      {p.leavesOpen.length > 0 && (
        <div className="sb-interp-meta">
          Leaves open: {p.leavesOpen.map(words).join(", ")}
        </div>
      )}
      {p.assumptions.length > 0 && (
        <div className="sb-interp-meta">
          Assumes: {p.assumptions.join("; ")}
        </div>
      )}
    </div>
  );
}

function Verse({
  v,
  edition,
  selected,
}: {
  v: InterpretedVerse;
  edition: string;
  selected: boolean;
}) {
  const [book, ch, vs] = v.osis.split(".");
  return (
    <section
      className={`sb-interp-verse${selected ? " sb-interp-verse--selected" : ""}`}
    >
      <header className="sb-interp-verse-head">
        <h3>Verse {v.verse}</h3>
        <a
          className="sb-interp-link"
          href={`${WORKBENCH_URL}/review/${encodeURIComponent(book!)}/${ch}/${vs}?edition=${encodeURIComponent(edition)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in the translation workbench{" "}
          <span className="material-symbols-outlined sb-interp-icon-sm">
            open_in_new
          </span>
        </a>
      </header>
      <p className="sb-interp-text">{v.text}</p>
      {v.status && (
        <div className="sb-interp-meta">
          Stage: {words(v.status.stage)}
          {v.status.note ? ` — ${v.status.note}` : ""}
        </div>
      )}
      {v.interpretation.questions.map((q) => (
        <Question key={q.id} q={q} />
      ))}
      {v.interpretation.paths.length > 0 && (
        <div>
          <h4 className="sb-interp-h4">Story paths over this verse</h4>
          {v.interpretation.paths.map((p) => (
            <Path key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

/** One verse in plain words: the verse, each question as a reader would ask it with the readings on the table and
 *  what this translation did, what the translators say, who read it which way — the full record folded under it. */
function PlainVerse({
  v,
  edition,
  label,
}: {
  v: InterpretedVerse;
  edition: string;
  label: string;
}) {
  const { t } = useI18n();
  const ed = edition.toUpperCase();
  const note = translatorsNote(v);
  const readers = namedReaders(v.interpretation.paths);
  return (
    <article className="sb-interp-plain">
      <h3 className="sb-interp-plain-title">
        {t("interp-how-read", {
          ref: label,
          defaultValue: "How {{ref}} is read",
        })}
      </h3>
      <blockquote className="sb-interp-plain-verse">
        “{v.text}”<span className="sb-interp-plain-edition"> — {ed}</span>
      </blockquote>
      {isDraft(v) && (
        <p className="sb-small sb-muted">
          {t("interp-draft", {
            defaultValue: "A draft — not yet checked by a person.",
          })}
        </p>
      )}
      {v.interpretation.questions.map((q) => {
        const pq = plainQuestion(q);
        return (
          <section
            key={q.id}
            className={`sb-interp-plain-q sb-interp-plain-q--${pq.state}`}
          >
            <h4 className="sb-interp-plain-ask">{pq.ask}</h4>
            {pq.term && (
              <p className="sb-small sb-muted">
                {t("interp-words", { defaultValue: "The words:" })}{" "}
                <span lang="he" dir="rtl" className="sb-interp-plain-term">
                  {pq.term}
                </span>
              </p>
            )}
            {pq.readings.length > 0 && (
              <>
                <p className="sb-interp-plain-label">
                  {pq.state === "belief"
                    ? t("interp-the-belief", { defaultValue: "The belief:" })
                    : t("interp-readings", {
                        defaultValue: "Ways to read it:",
                      })}
                </p>
                <ul className="sb-interp-plain-readings">
                  {pq.readings.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="sb-interp-plain-outcome">
              {pq.state === "decided" &&
                t("interp-decided", {
                  edition: ed,
                  defaultValue:
                    "{{edition}} has recorded a decision for one reading.",
                })}
              {pq.state === "open" &&
                (pq.reads
                  ? t("interp-undecided", {
                      defaultValue: "No reviewer has decided this yet.",
                    })
                  : t("interp-open", {
                      edition: ed,
                      defaultValue:
                        "Left open: the evidence does not settle it, so {{edition}} does not choose.",
                    }))}
              {pq.state === "policy" &&
                t("interp-policy", {
                  edition: ed,
                  defaultValue:
                    "{{edition}} translates the Greek text it is based on.",
                })}
              {pq.state === "belief" &&
                t("interp-belief", {
                  defaultValue:
                    "Not part of the translation: a later belief about the verse, shown so you know it exists.",
                })}
            </p>
            {pq.reads && (
              <div className="sb-interp-plain-reads">
                <p>
                  {pq.reads.open
                    ? t("interp-reads-open", {
                        defaultValue: "This translation leaves it open.",
                      })
                    : t("interp-reads", {
                        defaultValue: "This translation reads it as:",
                      })}{" "}
                  {pq.reads.reading && <strong>{pq.reads.reading}</strong>}
                </p>
                {pq.reads.how && (
                  <p className="sb-small sb-muted">{pq.reads.how}</p>
                )}
              </div>
            )}
            {pq.credit && (
              <p className="sb-small sb-muted sb-interp-plain-credit">
                {t("interp-notes-from", {
                  credit: pq.credit,
                  defaultValue: "Readings from {{credit}}",
                })}
              </p>
            )}
            {pq.other && (
              <p className="sb-interp-plain-other">
                {t("interp-other", {
                  defaultValue: "The other reading, kept in a note:",
                })}{" "}
                <em>{pq.other}</em>
              </p>
            )}
          </section>
        );
      })}
      {note && (
        <section className="sb-interp-plain-note">
          <h4 className="sb-interp-plain-ask">
            {t("interp-translators-say", {
              defaultValue: "What the translators say",
            })}
          </h4>
          <p>{note}</p>
        </section>
      )}
      {readers.length > 0 && (
        <p className="sb-interp-plain-readers">
          {t("interp-readers", {
            defaultValue: "Readers on record for this verse:",
          })}{" "}
          {readers.join(", ")}
        </p>
      )}
      <details className="sb-interp-plain-details">
        <summary>
          {t("interp-details", {
            defaultValue: "Details for scholars — the full record",
          })}
        </summary>
        <Verse v={v} edition={edition} selected={false} />
      </details>
    </article>
  );
}

/** The verse the pane was opened for (the verse bar's Interpretations, a Discover card) — kept here because using a
 *  verse-bar tool clears the selection. */
export const interpVerse = signal<{ chapterRef: string; verse: number } | null>(
  null
);

export function InterpretationsPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading } = state;
  const chapterRef = reading.chapterRef.value;
  const translationId = reading.translationId.value;
  const selected = state.selection.verses.value;
  const [data, setData] = useState<ChapterInterpretations | null | undefined>(
    undefined
  );
  /** Whose records these are: the translation being read, or RBS's when it carries none. */
  const [edition, setEdition] = useState(translationId);
  /** The one verse shown. */
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setData(undefined);
    const [bookId, ch] = chapterRef.split(".");
    void interpretationsFor(
      translationId,
      bookId!,
      Number(ch),
      state.stores.chapters
    )
      .then((f) => {
        if (!live) return;
        setData(f?.data ?? null);
        setEdition(f?.edition ?? translationId);
      })
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [chapterRef, translationId]);

  const verses = data?.verses ?? [];
  // A selected verse that carries a record is the only one shown (the verse bar's Interpretations, a Discover card);
  // with none selected, the chapter's verses can be switched between.
  const focus = interpVerse.value;
  const atSelected =
    (focus && focus.chapterRef === chapterRef
      ? verses.find((v) => v.verse === focus.verse)
      : undefined) ?? verses.find((v) => selected.includes(v.verse));
  const current =
    atSelected ?? verses.find((v) => v.verse === shown) ?? verses[0];
  const chapterLabel = `${reading.bookName.value} ${reading.chapterNumber.value}`;
  const label = (v: InterpretedVerse) =>
    `${reading.bookName.value} ${v.chapter}:${v.verse}`;
  return (
    <div className="sb-interp-pane">
      {data && edition.toLowerCase() !== translationId.toLowerCase() && (
        <p className="sb-interp-meta sb-interp-other-edition">
          {t("interpretations-other-edition", {
            mine: translationId,
            theirs: edition.toUpperCase(),
            defaultValue:
              "{{mine}} has no interpretation records here, so these are the {{theirs}} translation's.",
          })}
        </p>
      )}
      {data === undefined && <p className="sb-interp-meta">Loading…</p>}
      {data === null && (
        <p className="sb-interp-meta">
          {t("interp-unreadable", {
            defaultValue:
              "The interpretation records could not be read just now.",
          })}
        </p>
      )}
      {data && verses.length === 0 && (
        <p className="sb-interp-meta">
          {t("interp-none", {
            ref: chapterLabel,
            defaultValue:
              "No verse of {{ref}} has an interpretation record yet.",
          })}
        </p>
      )}
      {verses.length > 1 && !atSelected && (
        <nav
          className="sb-interp-verse-picker"
          aria-label={t("interp-verses", {
            defaultValue: "Verses with interpretations",
          })}
        >
          {verses.map((v) => (
            <button
              key={v.osis}
              type="button"
              className={`sb-discover-chip${v === current ? " sb-discover-chip--on" : ""}`}
              aria-pressed={v === current}
              onClick={() => setShown(v.verse)}
            >
              {label(v)}
            </button>
          ))}
        </nav>
      )}
      {current && (
        <PlainVerse
          key={current.osis}
          v={current}
          edition={data?.edition ?? edition}
          label={label(current)}
        />
      )}
      {data?.note && (
        <p className="sb-interp-meta sb-interp-note">{data.note}</p>
      )}
    </div>
  );
}
