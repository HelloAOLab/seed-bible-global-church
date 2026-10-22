// VOICE IN A SESSION — peer to peer: each device on voice holds one WebRTC audio connection to every other, the
// offers, answers and ICE candidates relayed by the room (which stores nothing of them), and no media server at all:
// nothing of the audio touches the estate or anyone else. STUN only, so some strict networks will not connect — the
// pane says so. The mesh suits a small group reading together; a church-sized call is a relay, which is a later cut.
import { computed, signal } from "@preact/signals";

/** Who offers to whom in a mesh: the lower id calls, so each pair sets up once. */
export const shouldOffer = (me: string, them: string) => me < them;

export interface VoicePeerPort {
  /** A connection to one peer; the mesh drives it through this small surface so a test needs no WebRTC. */
  createOffer(): Promise<unknown>;
  acceptOffer(offer: unknown): Promise<unknown>;
  acceptAnswer(answer: unknown): Promise<void>;
  addCandidate(candidate: unknown): Promise<void>;
  close(): void;
}

export interface VoiceDeps {
  me: () => string | null;
  /** Participants on voice now, by agent id (from the room's state). */
  onVoice: () => string[];
  signal: (to: string, payload: unknown) => Promise<void>;
  onSignal: (f: ((from: string, payload: unknown) => void) | null) => void;
  setVoice: (on: boolean) => Promise<void>;
  /** Opens the microphone and makes a peer connection for one other device; the browser's, or a fake in tests. */
  openPeer: (
    them: string,
    onTrack: (stream: MediaStream) => void
  ) => Promise<VoicePeerPort>;
  closeMic?: () => void;
}

type Signal =
  | { k: "offer"; sdp: unknown }
  | { k: "answer"; sdp: unknown }
  | { k: "ice"; candidate: unknown };

export function createVoice(deps: VoiceDeps) {
  const on = signal(false);
  const muted = signal(false);
  const peers = signal<Record<string, "connecting" | "connected" | "failed">>(
    {}
  );
  const error = signal<string | null>(null);
  const streams = new Map<string, MediaStream>();
  const ports = new Map<string, VoicePeerPort>();
  const remote = signal<Record<string, MediaStream>>({});

  async function connectTo(them: string) {
    if (ports.has(them) || !on.value) return;
    const port = await deps.openPeer(them, (stream) => {
      streams.set(them, stream);
      remote.value = { ...remote.value, [them]: stream };
      peers.value = { ...peers.value, [them]: "connected" };
    });
    ports.set(them, port);
    peers.value = { ...peers.value, [them]: "connecting" };
    const me = deps.me();
    if (me && shouldOffer(me, them)) {
      const sdp = await port.createOffer();
      await deps.signal(them, { k: "offer", sdp } satisfies Signal);
    }
  }

  function drop(them: string) {
    ports.get(them)?.close();
    ports.delete(them);
    streams.delete(them);
    const { [them]: _r, ...restRemote } = remote.value;
    remote.value = restRemote;
    const { [them]: _p, ...restPeers } = peers.value;
    peers.value = restPeers;
  }

  /** The room's state changed: call whoever is on voice and new, drop whoever left it. */
  async function reconcile() {
    if (!on.value) return;
    const me = deps.me();
    const now = new Set(deps.onVoice().filter((a) => a !== me));
    for (const them of now)
      if (!ports.has(them))
        await connectTo(them).catch(
          (e) => (error.value = e instanceof Error ? e.message : String(e))
        );
    for (const them of [...ports.keys()]) if (!now.has(them)) drop(them);
  }

  async function onSignal(from: string, payload: unknown) {
    if (!on.value) return;
    const sig = payload as Signal;
    let port = ports.get(from);
    if (!port) {
      port = await deps.openPeer(from, (stream) => {
        streams.set(from, stream);
        remote.value = { ...remote.value, [from]: stream };
        peers.value = { ...peers.value, [from]: "connected" };
      });
      ports.set(from, port);
      peers.value = { ...peers.value, [from]: "connecting" };
    }
    if (sig.k === "offer") {
      const sdp = await port.acceptOffer(sig.sdp);
      await deps.signal(from, { k: "answer", sdp } satisfies Signal);
    } else if (sig.k === "answer") await port.acceptAnswer(sig.sdp);
    else if (sig.k === "ice") await port.addCandidate(sig.candidate);
  }

  async function join() {
    if (on.value) return;
    error.value = null;
    on.value = true;
    deps.onSignal(
      (from, payload) =>
        void onSignal(from, payload).catch(
          (e) => (error.value = e instanceof Error ? e.message : String(e))
        )
    );
    await deps.setVoice(true);
    await reconcile();
  }

  async function leave() {
    if (!on.value) return;
    on.value = false;
    deps.onSignal(null);
    for (const them of [...ports.keys()]) drop(them);
    deps.closeMic?.();
    await deps.setVoice(false).catch(() => undefined);
  }

  const connected = computed(() =>
    Object.entries(peers.value)
      .filter(([, s]) => s === "connected")
      .map(([a]) => a)
  );

  return {
    on,
    muted,
    peers,
    connected,
    remote,
    error,
    join,
    leave,
    reconcile,
    onSignal,
    drop,
  };
}

export type Voice = ReturnType<typeof createVoice>;

/** The browser's peer: one RTCPeerConnection with the microphone's track, ICE relayed through `signal`. */
export function browserPeerFactory(
  signal: (to: string, payload: unknown) => Promise<void>,
  mic: () => Promise<MediaStream>,
  muted: () => boolean
): VoiceDeps["openPeer"] {
  return async (them, onTrack) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const stream = await mic();
    for (const track of stream.getAudioTracks()) {
      track.enabled = !muted();
      pc.addTrack(track, stream);
    }
    pc.ontrack = (e) => {
      const s = e.streams[0];
      if (s) onTrack(s);
    };
    pc.onicecandidate = (e) => {
      if (e.candidate)
        void signal(them, { k: "ice", candidate: e.candidate.toJSON() });
    };
    return {
      createOffer: async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        return offer;
      },
      acceptOffer: async (offer) => {
        await pc.setRemoteDescription(offer as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        return answer;
      },
      acceptAnswer: async (answer) => {
        await pc.setRemoteDescription(answer as RTCSessionDescriptionInit);
      },
      addCandidate: async (candidate) => {
        await pc
          .addIceCandidate(candidate as RTCIceCandidateInit)
          .catch(() => undefined);
      },
      close: () => pc.close(),
    };
  };
}
