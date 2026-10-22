// The DOM host renders with en.json already in i18next, so the first paint shows words, not keys — and the
// helpers the old reader's component tests leaned on work under this runner's jsdom project.
import { afterEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "../../../../apps/reader-web/src/i18n";
import { renderInHost } from "../../../helpers/TestHost";
import { pressAndRelease } from "../../../helpers/pressAndRelease";
import { stubColorScheme } from "../../../helpers/stubColorScheme";
import { installSpeech } from "../../../helpers/fakeSpeechSynthesis";

function Greeting(props: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={props.onClick}>
      {t("next-chapter")}
    </button>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("TestHost", () => {
  it("renders translated words on the first paint and the DOM helpers drive it", () => {
    const clicks: number[] = [];
    const r = renderInHost(<Greeting onClick={() => clicks.push(1)} />);
    const button = r.getByRole("button");
    expect(button.textContent).toBe("Next Chapter");
    pressAndRelease(button, button);
    expect(clicks).toHaveLength(1);

    const flip = stubColorScheme(true);
    const q = matchMedia("(prefers-color-scheme: dark)");
    const seen: boolean[] = [];
    q.addEventListener("change", (e) => seen.push(e.matches));
    expect(q.matches).toBe(true);
    flip(false);
    expect(seen).toEqual([false]);

    const speech = installSpeech([{ lang: "en-US", name: "Test" }]);
    speechSynthesis.speak(new SpeechSynthesisUtterance("hello"));
    expect(speech.queued.map((u) => u.text)).toEqual(["hello"]);
  });
});
