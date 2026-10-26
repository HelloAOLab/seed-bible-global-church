// Ported from packages/seed-bible components/TipTapEditor/VerseReferenceMark.tsx: a reference typed into a note
// ("John 3:16") becomes a link to that chapter, re-scanned on every change. The link is a reader route; the pane
// that shows the note turns a click into navigation plus a verse selection (`data-verse`).
import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { MarkType } from "@tiptap/pm/model";
import { scanVerseReferencesInText, type VerseRef } from "@seed/scripture";

let linkTranslation = "BSB";
/** Which translation a verse link opens — the one the reader has open. */
export const setVerseLinkTranslation = (id: string) => {
  linkTranslation = id;
};

export const verseLinkHref = (ref: VerseRef) =>
  `/read/${encodeURIComponent(linkTranslation)}/${ref.book}/${ref.chapter}`;
const verseAttr = (ref: VerseRef) =>
  ref.verse
    ? ref.endVerse && ref.endVerse !== ref.verse
      ? `${ref.verse}-${ref.endVerse}`
      : String(ref.verse)
    : null;

function verseReferencePlugin(markType: MarkType) {
  return new Plugin({
    key: new PluginKey("verseReferenceAutolink"),
    appendTransaction(transactions, _oldState, newState) {
      if (!transactions.some((transaction) => transaction.docChanged))
        return null;
      let minFrom = Infinity;
      let maxTo = -Infinity;
      for (const transaction of transactions) {
        for (const stepMap of transaction.mapping.maps) {
          stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            minFrom = Math.min(minFrom, newStart);
            maxTo = Math.max(maxTo, newEnd);
          });
        }
      }
      if (minFrom === Infinity) return null;
      const docSize = newState.doc.content.size;
      minFrom = Math.max(0, Math.min(minFrom, docSize));
      maxTo = Math.max(0, Math.min(maxTo, docSize));
      const tr = newState.tr;
      newState.doc.nodesBetween(minFrom, maxTo, (node, pos) => {
        if (!node.isTextblock) return;
        const contentFrom = pos + 1;
        const contentTo = contentFrom + node.content.size;
        const matches = scanVerseReferencesInText(node.textContent);
        tr.removeMark(contentFrom, contentTo, markType);
        for (const match of matches) {
          tr.addMark(
            contentFrom + match.start,
            contentFrom + match.end,
            markType.create({
              href: verseLinkHref(match.ref),
              verse: verseAttr(match.ref),
            })
          );
        }
      });
      tr.setMeta("addToHistory", false);
      return tr.steps.length > 0 ? tr : null;
    },
  });
}

export const VerseReferenceMark = Mark.create({
  name: "verseReference",
  inclusive: false,
  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("href"),
        renderHTML: (attributes) =>
          attributes.href ? { href: attributes.href } : {},
      },
      verse: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-verse"),
        renderHTML: (attributes) =>
          attributes.verse ? { "data-verse": attributes.verse } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "a.sb-verse-reference-link" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { class: "sb-verse-reference-link" }),
      0,
    ];
  },
  addProseMirrorPlugins() {
    return [verseReferencePlugin(this.type)];
  },
});

export default VerseReferenceMark;
