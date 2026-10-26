// TEXT WITH ITS BIBLE REFERENCES AS LINKS — the old reader's VerseReferenceText (footnotes): "John 1:13" in a line
// becomes a link to that place.
import type { TranslationBook } from "../../backend/bible";
import { findReferences, type FoundReference } from "../sessions/ChatPanel";

export function ReferenceText(props: {
  text: string;
  books: readonly TranslationBook[];
  onReference: (r: FoundReference) => void;
}) {
  const refs = findReferences(props.text, props.books);
  if (!refs.length) return <>{props.text}</>;
  const parts = [];
  let at = 0;
  for (const [n, r] of refs.entries()) {
    if (r.start > at) parts.push(props.text.slice(at, r.start));
    parts.push(
      <a
        key={n}
        href="#"
        className="sb-verse-reference-link"
        onClick={(e) => {
          e.preventDefault();
          props.onReference(r);
        }}
      >
        {props.text.slice(r.start, r.end)}
      </a>
    );
    at = r.end;
  }
  if (at < props.text.length) parts.push(props.text.slice(at));
  return <>{parts}</>;
}
