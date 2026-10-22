// THE SHELL — the tabs sidebar, the panes (one reader per slot), a side pane (notes, Your Content or account), the
// verse toolbar, the floating reader toolbar and the selector overlay. Replaces the hello page.
import { FriendsPane } from "./components/social/FriendsPane";
import { ShareDialog } from "./components/chrome/ShareDialog";
import { useEffect, useRef } from "preact/hooks";
import type { ReaderState } from "./state";
import { TabsSidebar } from "./components/reader/TabsSidebar";
import { PanesLayout } from "./components/reader/PanesLayout";
import { BibleSelector } from "./components/reader/BibleSelector";
import { VerseToolbar } from "./components/reader/VerseToolbar";
import { ReaderToolbar } from "./components/reader/ReaderToolbar";
import { NotesPane } from "./components/records/NotesPane";
import { AccountPane } from "./components/chrome/AccountPane";
import { YourContentPane } from "./components/records/YourContentPane";
import { TodayPane } from "./components/social/TodayPane";
import { DiscoverPane } from "./components/social/DiscoverPane";
import { SessionPane } from "./components/sessions/SessionPane";
import { LibraryPane } from "./components/library/LibraryPane";
import { Onboarding } from "./components/chrome/Onboarding";
import { AboutPane } from "./components/chrome/AboutPane";
import { ScriptureMapPane } from "./components/chrome/ScriptureMapPane";
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
  const collapsed = state.ui.sidebarCollapsed.value;
  const embed = state.ui.embed.value;
  // The floating toolbars centre on the READER column, not the window: its left edge and width go on the root
  // as CSS variables (app.css), re-measured when a pane opens, the sidebar changes or the window resizes.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const measure = () => {
      const r = mainRef.current?.getBoundingClientRect();
      if (!r) return;
      const root = document.documentElement.style;
      root.setProperty("--sb-main-left", `${r.left}px`);
      root.setProperty("--sb-main-width", `${r.width}px`);
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" && mainRef.current
        ? new ResizeObserver(measure)
        : null;
    if (mainRef.current) ro?.observe(mainRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [pane, collapsed, embed]);
  if (embed)
    return (
      <div className="sb-app sb-app-embed">
        <main className="sb-app-main" ref={mainRef}>
          <PanesLayout state={state} />
        </main>
        <VerseToolbar state={state} />
        <BibleSelector state={state} />
      </div>
    );
  return (
    <div
      className={`sb-app${pane !== "none" ? " sb-app-with-pane" : ""}${collapsed ? " sb-app-sidebar-collapsed" : ""}`}
    >
      <TabsSidebar state={state} />
      {state.ui.sidebarDrawer.value && (
        <div
          className="sb-drawer-backdrop"
          onClick={() => (state.ui.sidebarDrawer.value = false)}
        />
      )}
      <main className="sb-app-main" ref={mainRef}>
        <PanesLayout state={state} />
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
      {pane === "today" && (
        <aside className="sb-app-pane">
          <TodayPane state={state} />
        </aside>
      )}
      {pane === "discover" && (
        <aside className="sb-app-pane">
          <DiscoverPane state={state} />
        </aside>
      )}
      {pane === "session" && (
        <aside className="sb-app-pane">
          <SessionPane state={state} />
        </aside>
      )}
      {pane === "library" && (
        <aside className="sb-app-pane">
          <LibraryPane state={state} />
        </aside>
      )}
      {typeof pane === "string" && pane.startsWith("ext:") && (
        <aside className="sb-app-pane">
          {(() => {
            const p = state.extensions.panes.value.find(
              (x) => `ext:${x.id}` === pane
            );
            return (
              <section className="sb-pane" aria-label={p?.title ?? "Extension"}>
                <header className="sb-pane-header">
                  <h2>{p?.title ?? "Extension"}</h2>
                  <button
                    className="sb-pane-close"
                    aria-label="Close"
                    onClick={() => (state.ui.pane.value = "none")}
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </header>
                {p ? p.render() : null}
              </section>
            );
          })()}
        </aside>
      )}
      {pane === "about" && (
        <aside className="sb-app-pane">
          <AboutPane state={state} />
        </aside>
      )}
      {pane === "map" && (
        <aside className="sb-app-pane">
          <ScriptureMapPane state={state} />
        </aside>
      )}
      {pane === "friends" && (
        <aside className="sb-app-pane">
          <FriendsPane state={state} />
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
      <ShareDialog state={state} />
      <Onboarding state={state} />
    </div>
  );
}
