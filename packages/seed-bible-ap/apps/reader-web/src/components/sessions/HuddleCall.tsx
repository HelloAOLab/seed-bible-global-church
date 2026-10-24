// THE SESSION'S CALL — the card in the session pane (start or join it, who is in it, mute, leave, end) and, while
// you are in it, a bar of chips over the reading so the call stays in sight as you read: one chip per person, lit
// while they talk, with a crossed-out microphone when theirs is off.
import type { ReaderState } from "../../state";
import type { Huddle, HuddlePerson } from "../../state/sessions/huddle";
import { useI18n } from "../../i18n";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? "")
    .join("")
    .toUpperCase();

/** One person's camera, kept on its element while the track stays the same; your own is mirrored, as a mirror is. */
function Video({ person }: { person: HuddlePerson }) {
  return (
    <video
      className={`sb-huddle-video${person.self ? " sb-huddle-video-self" : ""}`}
      autoPlay
      muted
      playsInline
      ref={(el) => {
        const track = person.videoTrack;
        if (!el || !track) return;
        if ((el.srcObject as MediaStream | null)?.getVideoTracks()[0] !== track)
          el.srcObject = new MediaStream([track]);
      }}
    />
  );
}

function Chip({ person, talking }: { person: HuddlePerson; talking: boolean }) {
  const { t } = useI18n();
  const name = person.self
    ? `${person.name} (${t("you", { defaultValue: "you" })})`
    : person.name;
  return (
    <li
      className={`sb-huddle-chip${talking ? " sb-huddle-chip-talking" : ""}`}
      title={
        talking
          ? t("huddle-talking", { name, defaultValue: `${name} is talking` })
          : name
      }
      data-talking={talking ? "true" : undefined}
    >
      <span
        className={`sb-huddle-chip-avatar${person.videoTrack ? " sb-huddle-chip-avatar-video" : ""}`}
        aria-hidden="true"
      >
        {person.videoTrack ? (
          <Video person={person} />
        ) : (
          initialsOf(person.name) || "?"
        )}
      </span>
      <span className="sb-huddle-chip-name">{name}</span>
      {!person.micOn && (
        <span
          className="material-symbols-outlined sb-huddle-chip-muted"
          aria-label={t("huddle-muted", { defaultValue: "Microphone off" })}
        >
          mic_off
        </span>
      )}
    </li>
  );
}

function Chips({ huddle }: { huddle: Huddle }) {
  const { t } = useI18n();
  const speaking = huddle.speaking.value;
  return (
    <ul
      className="sb-huddle-chips"
      aria-label={t("huddle-people", { defaultValue: "In the call" })}
    >
      {huddle.people.value.map((p) => (
        <Chip key={p.id} person={p} talking={speaking.has(p.id)} />
      ))}
    </ul>
  );
}

/** Every other person's audio, on an element of its own. */
function Audio({ huddle }: { huddle: Huddle }) {
  return (
    <>
      {huddle.people.value
        .filter((p) => !p.self && p.audioTrack)
        .map((p) => (
          <audio
            key={p.id}
            autoPlay
            ref={(el) => {
              const track = p.audioTrack!;
              if (
                el &&
                (el.srcObject as MediaStream | null)?.getAudioTracks()[0] !==
                  track
              )
                el.srcObject = new MediaStream([track]);
            }}
          />
        ))}
    </>
  );
}

function MicButton({ huddle }: { huddle: Huddle }) {
  const { t } = useI18n();
  const on = huddle.micOn.value;
  return (
    <button
      type="button"
      className={`sb-note-button sb-huddle-mic${on ? " sb-huddle-mic-on" : ""}`}
      aria-pressed={on}
      onClick={() => void huddle.toggleMic()}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {on ? "mic" : "mic_off"}
      </span>{" "}
      {on
        ? t("voice-mute", { defaultValue: "Mute" })
        : t("voice-unmute", { defaultValue: "Unmute" })}
    </button>
  );
}

function CameraButton({
  huddle,
  compact,
}: {
  huddle: Huddle;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const on = huddle.cameraOn.value;
  const label = on
    ? t("huddle-camera-off", { defaultValue: "Turn camera off" })
    : t("huddle-camera-on", { defaultValue: "Turn camera on" });
  return (
    <button
      type="button"
      className={
        compact
          ? `sb-huddle-bar-button${on ? " sb-huddle-mic-on" : ""}`
          : `sb-note-button sb-huddle-camera${on ? " sb-huddle-mic-on" : ""}`
      }
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => void huddle.toggleCamera()}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {on ? "videocam" : "videocam_off"}
      </span>
      {compact ? null : (
        <>
          {" "}
          {on
            ? t("huddle-camera-stop", { defaultValue: "Stop video" })
            : t("huddle-camera-start", { defaultValue: "Start video" })}
        </>
      )}
    </button>
  );
}

/** Everyone whose camera is on, as tiles big enough to see a face. */
function VideoTiles({ huddle }: { huddle: Huddle }) {
  const speaking = huddle.speaking.value;
  const on = huddle.people.value.filter((p) => p.videoTrack);
  if (!on.length) return null;
  return (
    <ul className="sb-huddle-tiles">
      {on.map((p) => (
        <li
          key={p.id}
          className={`sb-huddle-tile${speaking.has(p.id) ? " sb-huddle-tile-talking" : ""}`}
        >
          <Video person={p} />
          <span className="sb-huddle-tile-name">{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function HuddleCard({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const huddle = state.huddle;
  if (!state.session.value || state.live.guest.value || !huddle.available.value)
    return null;
  const status = huddle.status.value;
  const count = huddle.inCall.value;
  return (
    <div className="sb-huddle-card">
      <h3 className="sb-content-section-title">
        <span className="material-symbols-outlined" aria-hidden="true">
          call
        </span>{" "}
        {t("huddle-title", { defaultValue: "Call" })}
      </h3>
      {status === "in" ? (
        <>
          <VideoTiles huddle={huddle} />
          <Chips huddle={huddle} />
          <div className="sb-note-card-actions">
            <MicButton huddle={huddle} />
            <CameraButton huddle={huddle} />
            <button
              type="button"
              className="sb-note-button"
              onClick={() => void huddle.leave()}
            >
              {t("huddle-leave", { defaultValue: "Leave call" })}
            </button>
            {state.live.isHost.value && (
              <button
                type="button"
                className="sb-note-button sb-note-button-danger"
                onClick={() => void huddle.end()}
              >
                {t("huddle-end", { defaultValue: "End call for everyone" })}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="sb-small sb-muted">
            {count > 0
              ? count === 1
                ? t("huddle-in-call-one", {
                    defaultValue: "1 person is in the call.",
                  })
                : t("huddle-in-call", {
                    count,
                    defaultValue: `${count} people are in the call.`,
                  })
              : t("huddle-none", {
                  defaultValue:
                    "Talk and see each other while you read. Your microphone and camera start off.",
                })}
          </p>
          <div className="sb-note-card-actions">
            <button
              type="button"
              className="sb-note-button sb-huddle-join"
              disabled={status === "joining"}
              onClick={() => void huddle.join()}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                call
              </span>{" "}
              {status === "joining"
                ? t("huddle-joining", { defaultValue: "Joining…" })
                : count > 0
                  ? t("huddle-join", { defaultValue: "Join the call" })
                  : t("huddle-start", { defaultValue: "Start a call" })}
            </button>
          </div>
        </>
      )}
      {huddle.error.value && (
        <p className="sb-small sb-error" role="alert">
          {huddle.error.value}
        </p>
      )}
    </div>
  );
}

/** Over the reading while you are in the call: who is in it, who is talking, your microphone, and Leave. */
export function HuddleBar({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const huddle = state.huddle;
  if (huddle.status.value !== "in") return null;
  return (
    <div
      className="sb-huddle-bar"
      role="region"
      aria-label={t("huddle-title", { defaultValue: "Call" })}
    >
      <button
        type="button"
        className="sb-huddle-bar-open"
        title={t("live-session", { defaultValue: "Live session" })}
        aria-label={t("live-session", { defaultValue: "Live session" })}
        onClick={() => (state.ui.pane.value = "session")}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          call
        </span>
      </button>
      <Chips huddle={huddle} />
      <button
        type="button"
        className={`sb-huddle-bar-button${huddle.micOn.value ? " sb-huddle-mic-on" : ""}`}
        aria-pressed={huddle.micOn.value}
        aria-label={
          huddle.micOn.value
            ? t("voice-mute", { defaultValue: "Mute" })
            : t("voice-unmute", { defaultValue: "Unmute" })
        }
        onClick={() => void huddle.toggleMic()}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {huddle.micOn.value ? "mic" : "mic_off"}
        </span>
      </button>
      <CameraButton huddle={huddle} compact />
      <button
        type="button"
        className="sb-huddle-bar-button sb-huddle-bar-leave"
        aria-label={t("huddle-leave", { defaultValue: "Leave call" })}
        title={t("huddle-leave", { defaultValue: "Leave call" })}
        onClick={() => void huddle.leave()}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          call_end
        </span>
      </button>
      <Audio huddle={huddle} />
    </div>
  );
}
