// THE SHELL — the tabs sidebar, the panes (one reader per slot), a side pane (notes, Your Content or account), the
// verse toolbar, the floating reader toolbar and the selector overlay. Replaces the hello page.
import { EditProfilePane, ProfilePane } from "./components/chrome/ProfilePane";
import { FullScreenHelp } from "./components/chrome/FullScreenHelp";
import { ActivityBar } from "./components/chrome/ActivityBar";
import { Toast } from "./components/chrome/Toast";
import { watchActivity } from "./state/chrome/activity";
import { SharedPageView } from "./components/social/SharedPageView";
import { Tour } from "./components/chrome/Tour";
import { FriendsPane } from "./components/social/FriendsPane";
import { FriendInviteDialog } from "./components/social/FriendInviteDialog";
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
import { ChapterNav, PhoneNav } from "./components/reader/PhoneNav";
import { FloatingSearch } from "./components/reader/FloatingSearch";
import { MobileSettingsSheet } from "./components/chrome/MobileSettingsSheet";
import { SavePicker } from "./components/records/SavePicker";
import { BookmarkPicker } from "./components/records/Bookmarks";
import { ChatPanel } from "./components/sessions/ChatPanel";
import { PlanNudge } from "./components/library/PlanCard";
import {
  PlaylistFinished,
  PlaylistNote,
} from "./components/library/PlaylistNote";
import {
  SessionCloseConfirm,
  SessionSettingsWindow,
} from "./components/sessions/SessionSettings";
import { HuddleBar } from "./components/sessions/HuddleCall";
import { LibraryPane } from "./components/library/LibraryPane";
import { Onboarding } from "./components/chrome/Onboarding";
import { AboutPane } from "./components/chrome/AboutPane";
import { LanguageSwitchPrompt } from "./components/chrome/LanguageSwitchPrompt";
import { OfflineRecovery } from "./components/reader/OfflineRecovery";
import { AdoptPrompt } from "./components/chrome/AdoptPrompt";
import { ScriptureMapPane } from "./components/chrome/ScriptureMapPane";
import { completeRedirectIfReturning } from "./session";

/** Panes that take the whole reading area, as in the old reader (its `fullscreen` placement). */
const FULL_WIDTH_PANES: readonly string[] = [
  "today",
  "profile",
  "edit-profile",
  "friends",
];

export function App({ state }: { state: ReaderState }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    void state.start().then((s) => (stop = s));
    completeRedirectIfReturning()
      .then((s) => s && state.signIn(s, { announce: true }))
      .catch((e: unknown) => console.warn("[connect]", e));
    return () => stop?.();
  }, []);
  useEffect(() => watchActivity(), []);

  const pane = state.ui.pane.value;
  const collapsed = state.ui.sidebarCollapsed.value;
  const embed = state.ui.embed.value;
  // The old reader's full-width panes: they take the reading area beside the sidebar (the chapter stays mounted
  // underneath, hidden, so it comes back where it was); the rest open as a side pane beside the chapter.
  const full = FULL_WIDTH_PANES.includes(pane);
  const paneClass = `sb-app-pane${full ? " sb-app-pane-full" : ""}`;
  // The floating toolbars centre on the READER column, not the window — or on a full-width pane, which has taken
  // its place: its left edge and width go on the root as CSS variables (app.css), re-measured when a pane opens,
  // the sidebar changes or the window resizes.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const area = () =>
      document.querySelector<HTMLElement>(".sb-app-pane-full") ??
      mainRef.current;
    const measure = () => {
      const r = area()?.getBoundingClientRect();
      if (!r) return;
      const root = document.documentElement.style;
      root.setProperty("--sb-main-left", `${r.left}px`);
      root.setProperty("--sb-main-width", `${r.width}px`);
      state.ui.mainWidth.value = r.width;
    };
    measure();
    const ro =
      typeof ResizeObserver !== "undefined" && mainRef.current
        ? new ResizeObserver(measure)
        : null;
    const el = area();
    if (el) ro?.observe(el);
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
        {state.selection.verses.value.length === 0 && (
          <div className="sb-reader-toolbar-wrap sb-reader-toolbar-wrap-embed">
            <ChapterNav state={state} />
          </div>
        )}
        <MobileSettingsSheet state={state} />
        <BibleSelector state={state} />
      </div>
    );
  return (
    <div
      className={`sb-app${full ? " sb-app-with-full-pane" : pane !== "none" ? " sb-app-with-pane" : ""}${collapsed ? " sb-app-sidebar-collapsed" : ""}`}
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
        <HuddleBar state={state} />
      </main>
      {pane === "notes" && (
        <aside className={paneClass}>
          <NotesPane state={state} />
        </aside>
      )}
      {pane === "content" && (
        <aside className={paneClass}>
          <YourContentPane state={state} />
        </aside>
      )}
      {pane === "today" && (
        <aside className={paneClass}>
          <TodayPane state={state} />
        </aside>
      )}
      {pane === "discover" && (
        <aside className={paneClass}>
          <DiscoverPane state={state} />
        </aside>
      )}
      {pane === "session" && (
        <aside className={paneClass}>
          <SessionPane state={state} />
        </aside>
      )}
      {pane === "library" && (
        <aside className={paneClass}>
          <LibraryPane state={state} />
        </aside>
      )}
      {typeof pane === "string" && pane.startsWith("ext:") && (
        <aside className={paneClass}>
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
        <aside className={paneClass}>
          <AboutPane state={state} />
        </aside>
      )}
      {pane === "map" && (
        <aside className={paneClass}>
          <ScriptureMapPane state={state} />
        </aside>
      )}
      {pane === "friends" && (
        <aside className={paneClass}>
          <FriendsPane state={state} />
        </aside>
      )}
      {pane === "profile" && (
        <aside className={paneClass}>
          <ProfilePane state={state} />
        </aside>
      )}
      {pane === "edit-profile" && (
        <aside className={paneClass}>
          <EditProfilePane state={state} />
        </aside>
      )}
      {pane === "account" && (
        <aside className={paneClass}>
          <AccountPane state={state} />
        </aside>
      )}
      <VerseToolbar state={state} />
      <ReaderToolbar state={state} />
      <PhoneNav state={state} />
      <FloatingSearch state={state} />
      <MobileSettingsSheet state={state} />
      <SavePicker state={state} />
      <BookmarkPicker state={state} />
      <ChatPanel state={state} />
      <PlaylistNote state={state} />
      <PlaylistFinished state={state} />
      <LanguageSwitchPrompt />
      <OfflineRecovery state={state} />
      <AdoptPrompt state={state} />
      <PlanNudge state={state} />
      <SessionSettingsWindow state={state} />
      <SessionCloseConfirm state={state} />
      <BibleSelector state={state} />
      <ShareDialog state={state} />
      {state.ui.shared.value && <SharedPageView state={state} />}
      <Tour state={state} />
      <FullScreenHelp state={state} />
      <ActivityBar />
      <Toast state={state} />
      <FriendInviteDialog state={state} />
      <Onboarding state={state} />
    </div>
  );
}
