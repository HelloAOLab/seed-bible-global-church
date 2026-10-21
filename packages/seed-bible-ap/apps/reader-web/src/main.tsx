import { render } from "preact";
import { relayCodeIfPopupReturn } from "@agenticprimitives/connect-client";
import { App } from "./App";
import { RELAY_CHANNEL } from "./session";
import "./styles.css";

const root = document.getElementById("root")!;
const search = new URLSearchParams(location.search);
// A popup landing back with its code relays it to the opener and closes; render only if it is still here.
if (search.get("ac_relay") === "1" && search.get("code")) {
  relayCodeIfPopupReturn(RELAY_CHANNEL);
  window.setTimeout(() => {
    if (window.closed) return;
    history.replaceState(null, "", location.pathname);
    render(<App />, root);
  }, 400);
} else {
  render(<App />, root);
}
