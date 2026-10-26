// THE WRITINGS PANE — everything the reference chronology and the evidence store hold that names the chapter on screen, in the
// order a reader of the period would want it: the book's own time (its window), the writings of that time — inscriptions and records,
// Second Temple and Dead Sea Scrolls literature, period writers — each dated and marked inside or after the window; the copies of the
// book; the commentary on its verses by work (with the cited quotes where the edition's rights allow one); the later reception,
// labelled as what later readers made of the text; and the reference chronology's entries. The selected verses narrow the lists.
// Nothing here judges the text; a writing is listed because its own record names the passage.
import { useEffect, useState } from "preact/hooks";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import {
  loadPassageWritings,
  WORKBENCH_URL,
  type CommentaryWork,
  type PassageWritingsAnswer,
  type WritingItem,
} from "./index";

function Writing({
  it,
  windowText,
}: {
  it: WritingItem;
  windowText: string | null;
}) {
  const [more, setMore] = useState(false);
  return (
    <li
      className={`sb-writing${it.inWindow === false ? " sb-writing--after" : ""}`}
    >
      <div className="sb-writing-head">
        <span className="material-symbols-outlined sb-interp-icon">
          {it.class === "realia"
            ? "history_edu"
            : it.class === "later-interpretation"
              ? "account_balance"
              : "menu_book"}
        </span>
        <div className="sb-writing-body">
          <div className="sb-writing-title">
            {it.title}
            {it.author && (
              <span className="sb-interp-meta"> — {it.author}</span>
            )}
          </div>
          <div className="sb-interp-meta">
            {it.date}
            {it.kind ? ` · ${it.kind}` : ""}
            {it.inWindow === true && windowText && (
              <span className="sb-interp-tag sb-interp-tag--in">
                {windowText}
              </span>
            )}
            {it.inWindow === false && (
              <span className="sb-interp-tag sb-interp-tag--after">
                after the book's window
              </span>
            )}
            {it.verses?.length
              ? ` · names verse${it.verses.length === 1 ? "" : "s"} ${it.verses.join(", ")}`
              : it.scope === "book"
                ? " · names the book"
                : ""}
          </div>
          {it.relation.length > 0 && (
            <div className="sb-interp-meta">{it.relation.join(" · ")}</div>
          )}
          {(it.why || it.links.length > 0) && (
            <button
              type="button"
              className="sb-interp-more"
              onClick={() => setMore(!more)}
            >
              {more ? "Less" : "More"}
            </button>
          )}
          {more && (
            <div>
              {it.why && <p className="sb-interp-p">{it.why}</p>}
              {it.links.map((l) => (
                <a
                  key={l.url}
                  className="sb-interp-link"
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.title}{" "}
                  <span className="material-symbols-outlined sb-interp-icon-sm">
                    open_in_new
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Commentary({
  w,
  selected,
}: {
  w: CommentaryWork;
  selected: number[];
}) {
  const [more, setMore] = useState(false);
  const cited = selected.length
    ? w.cited.filter((c) => selected.includes(Number(c.verse.split(".")[2])))
    : w.cited;
  return (
    <li className="sb-writing">
      <div className="sb-writing-head">
        <span className="material-symbols-outlined sb-interp-icon">
          format_quote
        </span>
        <div className="sb-writing-body">
          <div className="sb-writing-title">{w.label}</div>
          <div className="sb-interp-meta">
            {w.date ?? ""}
            {w.group ? ` · ${w.group}` : ""}
            {w.reception
              ? ` · a later reading${w.stance ? ` (${w.stance})` : ""}, listed as reception`
              : ""}{" "}
            ·{" "}
            {w.notes
              ? `${w.notes} note${w.notes === 1 ? "" : "s"}`
              : `${w.claims} claim${w.claims === 1 ? "" : "s"}`}{" "}
            on verses {w.verses.map((v) => v.split(".")[2]).join(", ")}
            {w.edition?.licence
              ? ` · ${w.edition.versionTitle ?? w.edition.id} (${w.edition.licence})`
              : ""}
            {w.attribution ? ` · ${w.attribution}` : ""}
          </div>
          {cited.length > 0 && (
            <button
              type="button"
              className="sb-interp-more"
              onClick={() => setMore(!more)}
            >
              {more ? "Hide" : "Show"} {cited.length}{" "}
              {w.notes
                ? `note${cited.length === 1 ? "" : "s"}`
                : `cited passage${cited.length === 1 ? "" : "s"}`}
            </button>
          )}
          {more &&
            cited.map((c) => (
              <blockquote key={c.id} className="sb-interp-quote">
                {c.quote ? <p>“{c.quote}”</p> : <p>{c.says}</p>}
                <footer>
                  {c.locator} · on verse {c.verse.split(".")[2]}
                  {c.stance ? ` · ${c.stance}` : ""}
                  {!c.quote
                    ? " · the edition's rights allow no quotation here; the claim is paraphrased"
                    : ""}
                  {c.published && (
                    <>
                      {" · "}
                      <a
                        className="sb-interp-link"
                        href={c.published.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        read the whole note at the publisher
                      </a>
                    </>
                  )}
                </footer>
              </blockquote>
            ))}
          {w.note && more && <p className="sb-interp-meta">{w.note}</p>}
        </div>
      </div>
    </li>
  );
}

export function WritingsPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const { reading } = state;
  const chapterRef = reading.chapterRef.value;
  const selected = state.selection.verses.value;
  const [data, setData] = useState<PassageWritingsAnswer | null | undefined>(
    undefined
  );
  useEffect(() => {
    let live = true;
    setData(undefined);
    const [bookId, ch] = chapterRef.split(".");
    void loadPassageWritings(bookId!, Number(ch), state.stores.chapters)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
  }, [chapterRef]);

  const w = data?.writings ?? null;
  const keep = (it: WritingItem) =>
    !selected.length ||
    it.scope === "book" ||
    !it.verses?.length ||
    it.verses.some((v) => selected.includes(v));
  const windowText = w?.window.ceilingText
    ? `the book's time, by ${w.window.ceilingText}`
    : null;
  const period = w ? w.period.filter(keep) : [];
  const realia = period.filter((i) => i.class === "realia");
  const literature = period.filter((i) => i.class !== "realia");
  const later = w ? w.later.filter(keep) : [];
  const commentary = w
    ? w.commentary.filter(
        (c) =>
          !selected.length ||
          c.verses.some((v) => selected.includes(Number(v.split(".")[2])))
      )
    : [];
  const register = w
    ? w.register.filter(
        (e) =>
          !selected.length ||
          e.refs.some((r) =>
            selected.some((v) => new RegExp(`:${v}(?![0-9])`).test(r))
          )
      )
    : [];
  const [book, ch] = chapterRef.split(".");
  const osisBook = data?.osisBook ?? book;

  return (
    <div className="sb-interp-pane">
      <p className="sb-interp-intro">
        {t("writings-intro", {
          defaultValue:
            "Not only related Scripture: the writings of the book's own period, the copies that carry it, what was written about it later, and the commentary on its verses — each dated, each saying how it relates. Listed because a record names the passage; never all that exist.",
        })}
      </p>
      {data === undefined && <p className="sb-interp-meta">Loading…</p>}
      {data === null && (
        <p className="sb-interp-meta">
          The writings could not be read just now.
        </p>
      )}
      {data && !w && (
        <p className="sb-interp-meta">
          No writings record is held for this chapter yet.
        </p>
      )}
      {w && (
        <div>
          <section className="sb-writing-section sb-writing-window">
            <h3>The book's own time</h3>
            <p className="sb-interp-p">
              {w.window.ceilingText ? (
                <>
                  Writings dated by <b>{w.window.ceilingText}</b> count as{" "}
                  {w.bookName}'s own time — {w.window.basis}.
                </>
              ) : (
                <>
                  No window is fixed for {w.bookName}: {w.window.basis}.
                </>
              )}
            </p>
            {selected.length > 0 && (
              <p className="sb-interp-meta">
                Narrowed to verse{selected.length === 1 ? "" : "s"}{" "}
                {selected.join(", ")} — clear the selection to see the whole
                chapter.
              </p>
            )}
          </section>
          {realia.length > 0 && (
            <section className="sb-writing-section">
              <h3>
                Inscriptions, records and the world of the book ({realia.length}
                )
              </h3>
              <ul className="sb-writing-list">
                {realia.map((it) => (
                  <Writing key={it.id} it={it} windowText={windowText} />
                ))}
              </ul>
            </section>
          )}
          {literature.length > 0 && (
            <section className="sb-writing-section">
              <h3>Writings of the period ({literature.length})</h3>
              <ul className="sb-writing-list">
                {literature.map((it) => (
                  <Writing key={it.id} it={it} windowText={windowText} />
                ))}
              </ul>
            </section>
          )}
          {w.witnesses.ofBook.length > 0 && !selected.length && (
            <section className="sb-writing-section">
              <h3>
                Copies of {w.bookName} ({w.witnesses.ofBook.length})
              </h3>
              {w.witnesses.researched && (
                <div className="sb-writing-researched">
                  {w.witnesses.researched.image && (
                    <a
                      href={w.witnesses.researched.image.page}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <img
                        src={w.witnesses.researched.image.thumb}
                        alt={w.witnesses.researched.object}
                        loading="lazy"
                      />
                    </a>
                  )}
                  <div>
                    <b>{w.witnesses.researched.object}</b> ·{" "}
                    {w.witnesses.researched.atlasDate}
                    {w.witnesses.researched.dating && (
                      <p className="sb-interp-p">
                        {w.witnesses.researched.dating}
                      </p>
                    )}
                    <p className="sb-interp-meta">
                      {w.witnesses.researched.image
                        ? `Image: ${w.witnesses.researched.image.licence}${w.witnesses.researched.image.credit ? `, ${w.witnesses.researched.image.credit}` : ""} · `
                        : ""}
                      {w.witnesses.researched.status}
                    </p>
                  </div>
                </div>
              )}
              <ul className="sb-writing-list">
                {w.witnesses.ofBook.map((x) => (
                  <li key={x.id} className="sb-writing">
                    <div className="sb-writing-head">
                      <span className="material-symbols-outlined sb-interp-icon">
                        description
                      </span>
                      <div className="sb-writing-body">
                        <div className="sb-writing-title">{x.title}</div>
                        <div className="sb-interp-meta">
                          {x.date}
                          {x.kind ? ` · ${x.kind}` : ""} · {x.group}
                        </div>
                        {x.links.map((l) => (
                          <a
                            key={l.url}
                            className="sb-interp-link"
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {l.title}{" "}
                            <span className="material-symbols-outlined sb-interp-icon-sm">
                              open_in_new
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {commentary.length > 0 && (
            <section className="sb-writing-section">
              <h3>
                Commentary on the chapter — later readers ({commentary.length}{" "}
                work{commentary.length === 1 ? "" : "s"})
              </h3>
              <ul className="sb-writing-list">
                {commentary.map((c) => (
                  <Commentary key={c.work} w={c} selected={selected} />
                ))}
              </ul>
            </section>
          )}
          {later.length > 0 && (
            <section className="sb-writing-section">
              <h3>Later reception ({later.length})</h3>
              <p className="sb-interp-meta">
                What later readers — Church fathers, rabbinic and medieval
                commentators, the Reformers — made of this text. Shown as
                reception: it tells you how the passage was read, not what it
                said in its own time.
              </p>
              <ul className="sb-writing-list">
                {later.map((it) => (
                  <Writing key={it.id} it={it} windowText={null} />
                ))}
              </ul>
            </section>
          )}
          {register.length > 0 && (
            <section className="sb-writing-section">
              <h3>Reference chronology</h3>
              <ul className="sb-writing-list">
                {register.map((e) => (
                  <li key={e.id} className="sb-writing">
                    <div className="sb-writing-head">
                      <span className="material-symbols-outlined sb-interp-icon">
                        timeline
                      </span>
                      <div className="sb-writing-body">
                        <div className="sb-writing-title">
                          {e.id} · {e.position}
                        </div>
                        <div className="sb-interp-meta">
                          {e.when ?? ""}
                          {e.dateText ? ` · ${e.dateText}` : ""} ·{" "}
                          {e.refs.join(", ")}
                        </div>
                        <a
                          className="sb-interp-link"
                          href={`${WORKBENCH_URL}/chronology?entry=${encodeURIComponent(e.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Read the entry in the chronology{" "}
                          <span className="material-symbols-outlined sb-interp-icon-sm">
                            open_in_new
                          </span>
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!realia.length &&
            !literature.length &&
            !commentary.length &&
            !later.length &&
            !register.length && (
              <p className="sb-interp-meta">
                Nothing in the corpus names{" "}
                {selected.length
                  ? `verse${selected.length === 1 ? "" : "s"} ${selected.join(", ")}`
                  : "this chapter"}{" "}
                beyond the copies of the book.
              </p>
            )}
          <p className="sb-interp-meta sb-interp-note">
            {w.note}{" "}
            <a
              className="sb-interp-link"
              href={`${WORKBENCH_URL}/review/${encodeURIComponent(osisBook ?? "Gen")}/${ch}/${selected[0] ?? 1}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in the translation workbench{" "}
              <span className="material-symbols-outlined sb-interp-icon-sm">
                open_in_new
              </span>
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
