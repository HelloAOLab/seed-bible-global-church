// Voice in a session is a mesh: the lower id offers, the other answers, ICE flows through the room's relay, leaving
// drops every peer; and a guest joins a session with the code and a name, never as its leader.
import { describe, expect, it } from "vitest";
import {
  createVoice,
  shouldOffer,
  type VoicePeerPort,
} from "../../../apps/reader-web/src/state/sessions/voice";
import { createDevBackend } from "../../../apps/reader-web/src/backend/dev";

const fakeRoom = () => {
  const wires = new Map<string, (from: string, payload: unknown) => void>();
  const flags = new Map<string, boolean>();
  return {
    wires,
    flags,
    deps(me: string, log: string[]) {
      const ports = new Map<string, VoicePeerPort>();
      return {
        me: () => me,
        onVoice: () =>
          [...flags.entries()].filter(([, on]) => on).map(([a]) => a),
        signal: async (to: string, payload: unknown) => {
          log.push(`${me}→${to}:${(payload as { k: string }).k}`);
          wires.get(to)?.(me, payload);
        },
        onSignal: (f: ((from: string, payload: unknown) => void) | null) => {
          if (f) wires.set(me, f);
          else wires.delete(me);
        },
        setVoice: async (on: boolean) => {
          flags.set(me, on);
        },
        openPeer: async (them: string, onTrack: (s: MediaStream) => void) => {
          const port: VoicePeerPort = {
            createOffer: async () => `offer-${me}`,
            acceptOffer: async () => {
              onTrack({} as MediaStream);
              return `answer-${me}`;
            },
            acceptAnswer: async () => {
              onTrack({} as MediaStream);
            },
            addCandidate: async () => {},
            close: () => log.push(`${me} closed ${them}`),
          };
          ports.set(them, port);
          return port;
        },
      };
    },
  };
};

describe("session voice", () => {
  it("the lower id offers, both end up connected, and leaving drops the peer", async () => {
    expect(shouldOffer("0xaaa", "0xbbb")).toBe(true);
    expect(shouldOffer("0xbbb", "0xaaa")).toBe(false);
    const room = fakeRoom();
    const log: string[] = [];
    const a = createVoice(room.deps("0xaaa", log));
    const b = createVoice(room.deps("0xbbb", log));
    await a.join();
    await b.join();
    await a.reconcile();
    await new Promise((r) => setTimeout(r, 0));
    expect(log.filter((l) => l.includes(":offer"))).toEqual([
      "0xaaa→0xbbb:offer",
    ]);
    expect(log.filter((l) => l.includes(":answer"))).toEqual([
      "0xbbb→0xaaa:answer",
    ]);
    expect(a.connected.value).toEqual(["0xbbb"]);
    expect(b.connected.value).toEqual(["0xaaa"]);
    await b.leave();
    expect(log).toContain("0xbbb closed 0xaaa");
    await a.reconcile();
    expect(a.connected.value).toEqual([]);
  });
  it("a guest joins with the share code and a name, as a reader", async () => {
    const backend = createDevBackend(null);
    const out = await backend.sessionJoinAsGuest(
      "00000000-0000-0000-0000-000000000000",
      "DEVCODE",
      "Visitor"
    );
    expect(out).toMatchObject({
      role: "reader",
      agent: "guest:dev",
      name: "Visitor",
    });
    await expect(
      backend.sessionJoinAsGuest(
        "00000000-0000-0000-0000-000000000000",
        "WRONG",
        "Visitor"
      )
    ).rejects.toThrow(/no standing/);
  });
});
