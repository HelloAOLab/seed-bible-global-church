import { render } from "preact";
import { relayCodeIfPopupReturn } from "@agenticprimitives/connect-client";
import { App } from "./App";
import { RELAY_CHANNEL } from "./session";
import { createReaderState } from "./state";
import { BIBLE_API_ENDPOINT, FreeUseBibleAPI } from "./backend/bible";
import { SEED_GLOBAL } from "./entry-server";
import { hydrateChapter } from "./hydrate";
import { BUILD_ID } from "./build";
import { registerSW } from "virtual:pwa-register";
import { initI18n } from "./i18n";
// The old reader's stylesheets, in its import order, then this app's own layer.
import "./styles/base.css";
import "./styles/utilities.css";
import "./styles/reader.css";
import "./styles/reader-extra.css";
import "./styles/selector-inline.css";
import "./styles/selector.css";
import "./styles/toolbar.css";
import "./styles/your-content.css";
import "./styles/tiptap.css";
import "./styles/audio-scrubber.css";
import "./styles/tabs-inline.css";
import "./styles/tabs.css";
import "./styles/pane-layout-inline.css";
import "./styles/pane-layout.css";
import "./styles/today.css";
import "./styles/discover.css";
import "./styles/friends.css";
import "./styles/huddle.css";
import "./styles/floating-search.css";
import "./styles/discover-panel.css";
import "./styles/mobile-settings.css";
import "./styles/playlists.css";
import "./styles/plans.css";
import "./styles/onboarding.css";
import "./styles/settings.css";
import "./styles/context-menu.css";
import "./styles/bookmarks.css";
import "./styles/profile.css";
import "leaflet/dist/leaflet.css";
import "./styles/app.css";

const root = document.getElementById("root")!;
const search = new URLSearchParams(location.search);

async function boot() {
  const seed = (window as unknown as Record<string, unknown>)[SEED_GLOBAL];
  // The edge-rendered chapter becomes a live tree at once (or is cleared when it is not this page's); the App
  // takes over below once the state is ready.
  hydrateChapter(root, {
    pathname: location.pathname,
    seed,
    buildId: BUILD_ID,
  });
  await initI18n();
  const api = new FreeUseBibleAPI(BIBLE_API_ENDPOINT);
  if (seed && typeof seed === "object")
    api.seedResponseCache(seed as Record<string, unknown>);
  const state = createReaderState({ api });
  render(<App state={state} />, root);
}

// A popup landing back with its code relays it to the opener and closes; render only if it is still here.
if (search.get("ac_relay") === "1" && search.get("code")) {
  relayCodeIfPopupReturn(RELAY_CHANNEL);
  window.setTimeout(() => {
    if (window.closed) return;
    history.replaceState(null, "", location.pathname);
    void boot();
  }, 400);
} else {
  void boot();
}
registerSW({ immediate: true });
