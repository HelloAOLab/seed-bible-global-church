// TODAY'S WELCOME VERSE, AS seedbible.org COLOURS IT — its table marks John 1:1's two anchors ("beginning", "the Word
// was God") for each default translation. A first visit opens English on AAB, so the words are coloured as there; BSB
// is not in the table, so a chapter opened in BSB shows it plain, as seedbible.org shows it.
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/preact";
import { TodayWelcome } from "../../apps/reader-web/src/components/social/TodayWelcome";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";
import { bibleResponses, BSB, JOHN } from "../helpers/bibleResponses";
import type { TranslationBookChapter } from "../../apps/reader-web/src/backend/bible";

afterEach(() => {
  document.body.innerHTML = "";
});

async function welcome(url?: string) {
  const bible = bibleResponses();
  bible.addChapter({
    translation: BSB,
    book: JOHN,
    chapter: {
      number: 1,
      content: [
        {
          type: "verse",
          number: 1,
          content: [
            "In the beginning was the Word, and the Word was with God, and the Word was God.",
          ],
        },
      ],
      footnotes: [],
    },
  } as unknown as TranslationBookChapter);
  const t = await createTestReaderState({
    identity: null,
    bible,
    ...(url ? { url } : {}),
  });
  const stop = await t.state.start();
  const r = renderInHost(<TodayWelcome state={t.state} hasReading={false} />);
  await waitFor(() =>
    expect(r.container.textContent).toMatch(/In the beginning was the Word/)
  );
  const marked = [
    ...r.container.querySelectorAll(".sb-today-welcome-screen-verse-highlight"),
  ].map((e) => e.textContent);
  stop();
  return marked;
}

describe("Today's welcome verse", () => {
  it("colours seedbible.org's two anchors on a first visit (AAB)", async () => {
    expect(await welcome("/")).toEqual(["beginning", "Word was God."]);
  });

  it("shows BSB plain, as seedbible.org does", async () => {
    expect(await welcome("/en/BSB/genesis/1")).toEqual([]);
  });
});
