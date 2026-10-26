// Twitch stays read-only: only Twitch's own embeds for a plausible channel name, parented to this page's host.
import { describe, expect, it } from "vitest";
import { twitchEmbeds } from "../../../apps/reader-web/src/extensions/twitch";

describe("the Twitch embeds", () => {
  it("point at Twitch's player and chat for the channel, parented to the page", () => {
    const e = twitchEmbeds("YourChurch", "seed-reader.faithnet.io")!;
    expect(e.player).toBe(
      "https://player.twitch.tv/?channel=yourchurch&parent=seed-reader.faithnet.io&muted=false"
    );
    expect(e.chat).toBe(
      "https://www.twitch.tv/embed/yourchurch/chat?parent=seed-reader.faithnet.io&darkpopout"
    );
    expect(twitchEmbeds("@yourchurch", "x.test")!.player).toContain(
      "channel=yourchurch"
    );
  });
  it("refuse a name Twitch would not have, and a missing host", () => {
    expect(twitchEmbeds("no spaces here", "x.test")).toBeNull();
    expect(twitchEmbeds("ab", "x.test")).toBeNull();
    expect(twitchEmbeds("https://twitch.tv/x", "x.test")).toBeNull();
    expect(twitchEmbeds("yourchurch", "")).toBeNull();
  });
});
