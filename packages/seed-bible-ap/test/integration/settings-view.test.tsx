// SETTINGS IN THE SIDEBAR, as the old reader has it: the ⚙ turns the sidebar into the Settings list in place of the
// tabs; each row opens its page there with ← back; ✕ brings the tabs back; from the collapsed rail the ⚙ opens the
// sidebar first. Every setting the Account settings pane holds has a page here.
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, waitFor } from "@testing-library/preact";
import { TabsSidebar } from "../../apps/reader-web/src/components/reader/TabsSidebar";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

afterEach(() => {
  document.body.innerHTML = "";
});

const ROWS = [
  "Account settings",
  "Display & Theme",
  "Toolbar",
  "Extensions",
  "Install App",
  "Launch tutorial",
  "Customize",
  "About Seed Bible",
];

describe("Settings in the sidebar", () => {
  it("opens in place of the tabs, in the old reader's order, and ✕ brings the tabs back", async () => {
    const t = await createTestReaderState({ identity: null });
    const r = renderInHost(<TabsSidebar state={t.state} />);
    expect(r.queryByText("Tabs")).not.toBeNull();
    fireEvent.click(r.getByRole("button", { name: "Open settings" }));
    await waitFor(() => expect(r.queryByText("Settings")).not.toBeNull());
    expect(r.queryByText("Tabs")).toBeNull();
    const labels = [
      ...r.container.querySelectorAll(".sb-settings-nav-label"),
    ].map((e) => e.textContent);
    expect(labels).toEqual(ROWS);
    expect(r.getByLabelText("Language")).not.toBeNull();
    fireEvent.click(r.getByRole("button", { name: "Close Settings" }));
    await waitFor(() => expect(r.queryByText("Tabs")).not.toBeNull());
  });

  it("each row opens its page with ← back to the list", async () => {
    const t = await createTestReaderState({});
    const r = renderInHost(<TabsSidebar state={t.state} />);
    fireEvent.click(r.getByRole("button", { name: "Open settings" }));
    const pages: Array<[string, RegExp]> = [
      ["Account settings", /sign out/i],
      ["Display & Theme", /line height/i],
      ["Toolbar", /the others are under more/i],
      ["Extensions", /extensions/i],
      ["Launch tutorial", /take the tour/i],
      ["Customize", /church theme/i],
    ];
    for (const [row, shows] of pages) {
      fireEvent.click(await r.findByText(row));
      await waitFor(() =>
        expect(
          r.container.querySelector(".sb-sidebar-settings-content")?.textContent
        ).toMatch(shows)
      );
      fireEvent.click(r.getByRole("button", { name: "Back" }));
      await waitFor(() => expect(r.queryByText("Settings")).not.toBeNull());
    }
  });

  it("from the collapsed rail, the ⚙ opens the sidebar first", async () => {
    const t = await createTestReaderState({ identity: null });
    t.state.ui.sidebarCollapsed.value = true;
    const r = renderInHost(<TabsSidebar state={t.state} />);
    fireEvent.click(r.getByRole("button", { name: "Open settings" }));
    await waitFor(() => expect(r.queryByText("Settings")).not.toBeNull());
    expect(t.state.ui.sidebarCollapsed.value).toBe(false);
  });
});
