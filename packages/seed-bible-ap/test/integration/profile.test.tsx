// PROFILE says what to do when the person's agent cannot take the reader's writes yet: an agent whose playbook predates
// the Library reads refuses them ("does not offer library.file.read"); the Home gives it the behaviour on its next
// open, so Profile names that, with the way there, instead of the raw refusal. A sign-in with no Home name shows a
// short address, not the chain-prefixed one.
import { afterEach, describe, expect, it } from "vitest";
import { act } from "preact/test-utils";
import { ProfilePane } from "../../apps/reader-web/src/components/chrome/ProfilePane";
import { createTestReaderState } from "../helpers/createTestReaderState";
import { renderInHost } from "../helpers/TestHost";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Profile", () => {
  it("names the fix when the agent does not offer the Library reads yet", async () => {
    const t = await createTestReaderState({});
    const r = renderInHost(<ProfilePane state={t.state} />);
    expect(r.queryByRole("link", { name: /open your home/i })).toBeNull();
    await act(async () => {
      (t.state.outbox.lastError as { value: string | null }).value =
        "this agent does not offer library.file.read";
    });
    expect(
      r.getByRole("link", { name: /open your home/i }).getAttribute("href")
    ).toMatch(/^https:\/\//);
    expect(r.container.textContent).toMatch(/open your home once/i);
  });

  it("shows a short address for a sign-in with no Home name", async () => {
    const t = await createTestReaderState({});
    await act(async () => {
      t.state.session.value = {
        ...t.state.session.value!,
        name: "",
        sub: "eip155:34348:0xd9ee46725d6be6bd439612115f47577eefd8ab2c",
      };
    });
    const r = renderInHost(<ProfilePane state={t.state} />);
    const line = r.container.querySelector(".sb-profile-email")!.textContent;
    expect(line).toBe("0xd9ee…ab2c");
  });
});
