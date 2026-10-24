// THE SESSION'S CALL: joining starts the call (or joins the one running) and shows who is in it; a chip lights while
// its person talks and goes dark a moment after they stop; leaving turns the microphone off before telling the
// server; a server with no call service hides the call (the session's own voice stays); a refusal is shown.
import { describe, expect, it } from "vitest";
import {
  createHuddle,
  type HuddleMeetingPort,
  type HuddleOp,
  type HuddlePerson,
} from "../../../apps/reader-web/src/state/sessions/huddle";

function fakeMeeting(people: HuddlePerson[], log: string[]) {
  let changed: (() => void) | null = null;
  let spoke: ((id: string) => void) | null = null;
  const port: HuddleMeetingPort = {
    people: () => people.map((p) => ({ ...p })),
    onChange: (f) => ((changed = f), () => (changed = null)),
    onSpeaker: (f) => ((spoke = f), () => (spoke = null)),
    setMic: async (on) => {
      log.push(`mic ${on ? "on" : "off"}`);
      people = people.map((p) => (p.self ? { ...p, micOn: on } : p));
    },
    leave: async () => void log.push("left meeting"),
  };
  return {
    port,
    arrive: (p: HuddlePerson) => {
      people = [...people, p];
      changed?.();
    },
    talk: (id: string) => spoke?.(id),
  };
}

const ME: HuddlePerson = { id: "p-me", name: "Ruth", micOn: false, self: true };
const NAOMI: HuddlePerson = {
  id: "p-n",
  name: "Naomi",
  micOn: true,
  self: false,
};

function setup(
  answers: Partial<Record<HuddleOp, () => Promise<unknown>>> = {}
) {
  const log: string[] = [];
  let t = 1000;
  const meeting = fakeMeeting([ME, NAOMI], log);
  const huddle = createHuddle({
    ask: async (op) => {
      log.push(`ask ${op}`);
      const a = answers[op];
      return (a ? await a() : { authToken: "tok" }) as never;
    },
    openMeeting: async (token) => {
      log.push(`open ${token}`);
      return meeting.port;
    },
    now: () => t,
    holdMs: 1500,
  });
  return { huddle, log, meeting, advance: (ms: number) => (t += ms) };
}

describe("the session's call", () => {
  it("joins with the server's token and shows who is in it", async () => {
    const { huddle, log, meeting } = setup();
    await huddle.join();
    expect(huddle.status.value).toBe("in");
    expect(log).toEqual(["ask start", "open tok"]);
    expect(huddle.people.value.map((p) => p.name)).toEqual(["Ruth", "Naomi"]);
    meeting.arrive({ id: "p-b", name: "Boaz", micOn: false, self: false });
    expect(huddle.people.value.map((p) => p.name)).toContain("Boaz");
    await huddle.leave();
  });

  it("lights a chip while its person talks and lets it go a moment after", async () => {
    const { huddle, meeting, advance } = setup();
    await huddle.join();
    meeting.talk("p-n");
    expect([...huddle.speaking.value]).toEqual(["p-n"]);
    advance(1000);
    meeting.talk("p-n");
    advance(1000);
    meeting.talk("p-me");
    expect(new Set(huddle.speaking.value)).toEqual(new Set(["p-n", "p-me"]));
    advance(1600);
    meeting.talk("p-me");
    expect([...huddle.speaking.value]).toEqual(["p-me"]);
    await huddle.leave();
  });

  it("turns the microphone on and off", async () => {
    const { huddle } = setup();
    await huddle.join();
    expect(huddle.micOn.value).toBe(false);
    await huddle.toggleMic();
    expect(huddle.micOn.value).toBe(true);
    await huddle.toggleMic();
    expect(huddle.micOn.value).toBe(false);
    await huddle.leave();
  });

  it("stops the microphone before telling the server it left", async () => {
    const { huddle, log } = setup();
    await huddle.join();
    await huddle.toggleMic();
    log.length = 0;
    await huddle.leave();
    expect(log).toEqual(["mic off", "left meeting", "ask leave"]);
    expect(huddle.status.value).toBe("idle");
    expect(huddle.people.value).toEqual([]);
  });

  it("counts who is in a running call before you join", async () => {
    const { huddle } = setup({
      get: async () => ({
        run: {
          state: "active",
          roster: [{ joined: true }, { joined: true }, { joined: false }],
        },
      }),
    });
    await huddle.look();
    expect(huddle.inCall.value).toBe(2);
  });

  it("hides the call where the server has no call service", async () => {
    const { huddle } = setup({
      get: async () => {
        throw new Error("huddles_not_configured");
      },
    });
    await huddle.look();
    expect(huddle.available.value).toBe(false);
    expect(huddle.error.value).toBeNull();
  });

  it("says why it could not join, and stays out", async () => {
    const { huddle, log } = setup({
      start: async () => {
        throw new Error("no standing in this session");
      },
    });
    await huddle.join();
    expect(huddle.status.value).toBe("idle");
    expect(huddle.error.value).toBe("no standing in this session");
    expect(log).toEqual(["ask start"]);
  });
});
