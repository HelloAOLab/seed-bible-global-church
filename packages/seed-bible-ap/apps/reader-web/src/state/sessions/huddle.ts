// THE CALL IN A LIVE SESSION — the estate's huddle (Cloudflare RealtimeKit, through the reader's server and the Home):
// a media server carries the audio, so it holds a church-sized group where the session's own voice (the peer mesh,
// voice.ts) holds a handful. Signed-in people only: the server names them to the Home; a guest stays on the mesh.
// Who is in the call shows as chips, and a chip lights while that person talks (the provider's active-speaker
// events, held for a moment so a breath between words does not flicker it).
import { computed, signal } from "@preact/signals";

export type HuddleOp = "start" | "join" | "get" | "leave" | "end";

export interface HuddleAnswer {
  authToken?: string;
  run?: {
    state?: string;
    roster?: Array<{ joined: boolean }>;
  } | null;
}

export interface HuddlePerson {
  /** The provider's participant id (this call only). */
  id: string;
  name: string;
  micOn: boolean;
  self: boolean;
  audioTrack?: MediaStreamTrack;
}

/** The joined meeting, as the call needs it — the SDK's in the browser, a fake in tests. */
export interface HuddleMeetingPort {
  people(): HuddlePerson[];
  /** Anyone joined, left, or turned their microphone on or off. */
  onChange(f: () => void): () => void;
  onSpeaker(f: (id: string) => void): () => void;
  setMic(on: boolean): Promise<void>;
  leave(): Promise<void>;
}

export interface HuddleDeps {
  ask(op: HuddleOp): Promise<HuddleAnswer>;
  openMeeting(authToken: string): Promise<HuddleMeetingPort>;
  now?: () => number;
  /** How long a chip stays lit after the last word heard. */
  holdMs?: number;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createHuddle(deps: HuddleDeps) {
  const now = deps.now ?? (() => Date.now());
  const holdMs = deps.holdMs ?? 1500;
  const status = signal<"idle" | "joining" | "in">("idle");
  const error = signal<string | null>(null);
  /** False once the server says there is no call service here; the session's own voice is offered instead. */
  const available = signal(true);
  /** People in the call now, as the last look at it said (before joining). */
  const inCall = signal(0);
  const people = signal<HuddlePerson[]>([]);
  const lastHeard = signal<Record<string, number>>({});
  const clock = signal(now());
  const speaking = computed(() => {
    const t = clock.value;
    return new Set(
      Object.entries(lastHeard.value)
        .filter(([, at]) => t - at < holdMs)
        .map(([id]) => id)
    );
  });
  const micOn = computed(
    () => people.value.find((p) => p.self)?.micOn ?? false
  );

  let meeting: HuddleMeetingPort | null = null;
  let unhook: Array<() => void> = [];
  let tick: ReturnType<typeof setInterval> | null = null;

  const refused = (e: unknown) => {
    const msg = errorText(e);
    if (/huddles_not_configured/.test(msg)) available.value = false;
    error.value = /huddles_not_configured/.test(msg) ? null : msg;
  };

  function drop() {
    for (const f of unhook) f();
    unhook = [];
    if (tick) clearInterval(tick);
    tick = null;
    meeting = null;
    people.value = [];
    lastHeard.value = {};
    status.value = "idle";
  }

  /** Start the call, or join the one already running — the server decides which. */
  async function join() {
    if (status.value !== "idle") return;
    status.value = "joining";
    error.value = null;
    try {
      const out = await deps.ask("start");
      if (!out.authToken) throw new Error("the call did not let you in");
      const m = await deps.openMeeting(out.authToken);
      meeting = m;
      const sync = () => (people.value = m.people());
      unhook.push(m.onChange(sync));
      unhook.push(
        m.onSpeaker((id) => {
          lastHeard.value = { ...lastHeard.value, [id]: now() };
          clock.value = now();
        })
      );
      tick = setInterval(() => (clock.value = now()), 250);
      sync();
      status.value = "in";
    } catch (e) {
      drop();
      refused(e);
    }
  }

  async function leave() {
    const m = meeting;
    if (!m) return;
    // The microphone stops here first; the server is told after, and may be slow.
    await m.setMic(false).catch(() => undefined);
    await m.leave().catch(() => undefined);
    drop();
    await deps.ask("leave").catch(() => undefined);
  }

  /** The host ends the call for everyone. */
  async function end() {
    await deps.ask("end").catch(refused);
    await leave();
  }

  async function toggleMic() {
    const m = meeting;
    if (!m) return;
    try {
      await m.setMic(!micOn.value);
    } catch (e) {
      error.value = errorText(e);
    }
    people.value = m.people();
  }

  /** A look at the call without joining it: whether one is running, and how many are in it. */
  async function look() {
    try {
      const out = await deps.ask("get");
      available.value = true;
      inCall.value =
        out.run && out.run.state !== "ended"
          ? (out.run.roster ?? []).filter((r) => r.joined).length
          : 0;
    } catch (e) {
      refused(e);
    }
  }

  return {
    status,
    error,
    available,
    inCall,
    people,
    speaking,
    micOn,
    join,
    leave,
    end,
    toggleMic,
    look,
  };
}

export type Huddle = ReturnType<typeof createHuddle>;

interface SdkParticipant {
  id: string;
  name: string;
  audioEnabled: boolean;
  audioTrack?: MediaStreamTrack;
}
interface SdkEmitter {
  on(event: string, f: (...a: never[]) => void): void;
  off(event: string, f: (...a: never[]) => void): void;
}

/** The provider says who is the loudest only when that changes, so a long reading would go dark after a moment:
 *  each open microphone's level is measured here too, and anyone above a quiet room's hum counts as talking. */
function watchLevels(
  list: () => SdkParticipant[],
  heard: (id: string) => void
): () => void {
  if (typeof AudioContext === "undefined") return () => undefined;
  const ctx = new AudioContext();
  const meters = new Map<
    string,
    { track: MediaStreamTrack; node: AnalyserNode }
  >();
  const buf = new Float32Array(512);
  const timer = setInterval(() => {
    const now = list().filter((p) => p.audioEnabled && p.audioTrack);
    for (const [id, m] of meters)
      if (!now.some((p) => p.id === id && p.audioTrack === m.track))
        meters.delete(id);
    for (const p of now) {
      if (meters.has(p.id)) continue;
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      ctx
        .createMediaStreamSource(new MediaStream([p.audioTrack!]))
        .connect(node);
      meters.set(p.id, { track: p.audioTrack!, node });
    }
    for (const [id, m] of meters) {
      m.node.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      if (Math.sqrt(sum / buf.length) > 0.02) heard(id);
    }
  }, 200);
  return () => {
    clearInterval(timer);
    void ctx.close().catch(() => undefined);
  };
}

/** The browser's meeting: RealtimeKit, loaded only when someone joins a call (it is large). */
export async function openRealtimeKit(
  authToken: string
): Promise<HuddleMeetingPort> {
  const { default: RealtimeKitClient } =
    await import("@cloudflare/realtimekit");
  const m = await RealtimeKitClient.init({
    authToken,
    defaults: { audio: false, video: false },
  });
  await m.join();
  const self = m.self as unknown as SdkParticipant & SdkEmitter;
  const joined = m.participants.joined as unknown as SdkEmitter & {
    toArray(): SdkParticipant[];
  };
  const participants = m.participants as unknown as SdkEmitter;
  const on = (em: SdkEmitter, events: string[], f: () => void) => {
    for (const e of events) em.on(e, f);
    return () => {
      for (const e of events) em.off(e, f);
    };
  };
  return {
    people: () => [
      { id: self.id, name: self.name, micOn: self.audioEnabled, self: true },
      ...joined.toArray().map((p) => ({
        id: p.id,
        name: p.name,
        micOn: p.audioEnabled,
        self: false,
        ...(p.audioTrack ? { audioTrack: p.audioTrack } : {}),
      })),
    ],
    onChange: (f) => {
      const a = on(
        joined,
        ["participantJoined", "participantLeft", "audioUpdate"],
        f
      );
      const b = on(self, ["audioUpdate"], f);
      return () => {
        a();
        b();
      };
    },
    onSpeaker: (f) => {
      const h = (p: { peerId: string }) => f(p.peerId);
      participants.on("activeSpeaker", h as never);
      const stopLevels = watchLevels(() => [self, ...joined.toArray()], f);
      return () => {
        participants.off("activeSpeaker", h as never);
        stopLevels();
      };
    },
    setMic: async (on) => {
      if (on && !self.audioEnabled) await m.self.enableAudio();
      if (!on && self.audioEnabled) await m.self.disableAudio();
    },
    leave: () => m.leave(),
  };
}
