// THE SHELL — the reader column, a side pane (notes or account), the verse toolbar, the floating reader toolbar
// and the selector overlay. Replaces the hello page.
import { useEffect } from "preact/hooks";
import type { ReaderState } from "./state";
import { BibleReader } from "./components/reader/BibleReader";
import { BibleSelector } from "./components/reader/BibleSelector";
import { VerseToolbar } from "./components/reader/VerseToolbar";
import { ReaderToolbar } from "./components/reader/ReaderToolbar";
import { NotesPane } from "./components/records/NotesPane";
import { AccountPane } from "./components/chrome/AccountPane";
import { YourContentPane } from "./components/records/YourContentPane";
import { completeRedirectIfReturning } from "./session";

export function App({ state }: { state: ReaderState }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    void state.start().then((s) => (stop = s));
    completeRedirectIfReturning()
      .then((s) => s && state.signIn(s))
      .catch((e: unknown) => console.warn("[connect]", e));
    return () => stop?.();
  }, []);

  const pane = state.ui.pane.value;
  return (
    <div className={`sb-app${pane !== "none" ? " sb-app-with-pane" : ""}`}>
      <main className="sb-app-main">
        <BibleReader state={state} />
      </main>
      {pane === "notes" && (
        <aside className="sb-app-pane">
          <NotesPane state={state} />
        </aside>
      )}
      {pane === "content" && (
        <aside className="sb-app-pane">
          <YourContentPane state={state} />
        </aside>
      )}
      {pane === "account" && (
        <aside className="sb-app-pane">
          <AccountPane state={state} />
        </aside>
      )}
      <VerseToolbar state={state} />
      <ReaderToolbar state={state} />
      <BibleSelector state={state} />
    </div>
  );
}
