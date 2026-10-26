// A LIVE SESSION'S SETTINGS ON A DEVICE: when someone moves the passage this device goes there too, in its own
// translation unless the host shares one; someone else's highlight fades after the host's "Highlight for"; a tapped
// verse flares only for those the settings name. The room is faked at its boundary (`openRoom`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, signal } from "@preact/signals";
import { createLiveSession } from "../../../apps/reader-web/src/state/sessions/live";
import type {
  Room,
  RoomHandlers,
  SessionState,
} from "../../../apps/reader-web/src/backend/room";
import type { Reading } from "../../../apps/reader-web/src/state/reading/reading";
import type { ReaderBackend } from "../../../apps/reader-web/src/backend/ReaderBackend";

const ME = { agent: "0x" + "bb".repeat(20), name: "Bob" };
const HOST = "0x" + "aa".repeat(20);
const CAL = "0x" + "cc".repeat(20);

function fakeReading() {
  const translationId = signal("KJV");
  const bookId = signal("JHN");
  const chapterNumber = signal(3);
  return {
    translationId,
    bookId,
    chapterNumber,
    chapterRef: computed(() => `${bookId.value}.${chapterNumber.value}`),
    goTo: async (t: string, b: string, c: number) => {
      translationId.value = t;
      bookId.value = b;
      chapterNumber.value = c;
    },
  } as unknown as Reading;
}

function session(over: Partial<SessionState> = {}): SessionState {
  return {
    id: "s1",
    host: { agent: HOST, name: "Ruth" },
    leader: HOST,
    passage: { translationId: "BSB", bookId: "JHN", chapterNumber: 3 },
    participants: [
      { agent: HOST, name: "Ruth", role: "leader", connections: 1 },
      { agent: ME.agent, name: "Bob", role: "reader", connections: 1 },
      { agent: CAL, name: "Cal", role: "reader", connections: 1 },
    ],
    decorations: [],
    seq: 1,
    startedAt: "2026-10-25T10:00:00Z",
    endedAt: null,
    recordRef: null,
    ...over,
  };
}

async function joined() {
  let handlers: RoomHandlers | null = null;
  const reading = fakeReading();
  const live = createLiveSession({
    backend: {
      sessionJoin: async () => ({ sessionId: "s1", token: "t" }),
    } as unknown as ReaderBackend,
    reading: () => reading,
    identity: () => ME,
    openRoom: (_id, _token, h) => {
      handlers = h;
      return {
        close: () => {},
        chatPage: async () => [],
      } as unknown as Room;
    },
  });
  await live.join("s1", "CODE");
  return { live, reading, room: () => handlers! };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("live session settings on a device", () => {
  it("follows a move in its own translation, or in the shared one when the host shares it", async () => {
    const { reading, room } = await joined();
    room().onState(session());
    expect(reading.chapterRef.value).toBe("JHN.3");
    expect(reading.translationId.value).toBe("KJV");
    room().onState(
      session({
        passage: { translationId: "BSB", bookId: "ROM", chapterNumber: 8 },
      })
    );
    expect(reading.chapterRef.value).toBe("ROM.8");
    expect(reading.translationId.value).toBe("KJV");

    room().onState(
      session({
        passage: { translationId: "BSB", bookId: "ROM", chapterNumber: 9 },
        settings: {
          hostOnlyNavigate: false,
          hostOnlyHighlight: false,
          highlightSeconds: 16,
          selectionEffects: "hosts-only",
          shareTranslation: true,
        },
      })
    );
    expect(reading.chapterRef.value).toBe("ROM.9");
    expect(reading.translationId.value).toBe("BSB");
  });

  it("anyone may move everyone by default; only the host's people once the host turns that on", async () => {
    const { live, room } = await joined();
    room().onState(session());
    expect(live.isLeader.value).toBe(true);
    expect(live.canHighlight.value).toBe(true);
    room().onState(
      session({
        settings: {
          hostOnlyNavigate: true,
          hostOnlyHighlight: true,
          highlightSeconds: 16,
          selectionEffects: "hosts-only",
          shareTranslation: false,
        },
      })
    );
    expect(live.isLeader.value).toBe(false);
    expect(live.canHighlight.value).toBe(false);
    room().onState(session({ ...session(), coHosts: [ME.agent] }));
    expect(live.isHostLike.value).toBe(true);
  });

  it("someone else's highlight fades after the host's time; your own stays", async () => {
    const { live, room } = await joined();
    room().onState(
      session({
        decorations: [
          {
            id: "d1",
            by: HOST,
            chapter: "JHN.3",
            start: 16,
            end: 16,
            colorId: "yellow",
            at: "2026-10-25T10:00:00Z",
          },
          {
            id: "d2",
            by: ME.agent,
            chapter: "JHN.3",
            start: 17,
            end: 17,
            colorId: "green",
            at: "2026-10-25T10:00:00Z",
          },
        ],
      })
    );
    expect(live.decorations.value.map((d) => d.id)).toEqual(["d1", "d2"]);
    vi.advanceTimersByTime(17_000);
    expect(live.decorations.value.map((d) => d.id)).toEqual(["d2"]);
  });

  it("a tapped verse flares for the host by default, not for someone else, and goes after a moment", async () => {
    const { live, room } = await joined();
    room().onState(session());
    room().onFrame({
      t: "presence",
      by: CAL,
      name: "Cal",
      verse: 5,
      at: Date.now(),
    });
    expect(live.flares.value).toEqual([]);
    room().onFrame({
      t: "presence",
      by: HOST,
      name: "Ruth",
      verse: 7,
      chapter: "JHN.3",
      from: 1,
      to: 20,
      at: Date.now(),
    });
    expect(live.flares.value).toMatchObject([
      { agent: HOST, chapter: "JHN.3", verse: 7 },
    ]);
    // The same verse again (a scroll, not a tap) does not flare twice.
    room().onFrame({
      t: "presence",
      by: HOST,
      name: "Ruth",
      verse: 7,
      at: Date.now(),
    });
    expect(live.flares.value).toHaveLength(1);
    vi.advanceTimersByTime(1300);
    expect(live.flares.value).toEqual([]);
  });
});
