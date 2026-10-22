// TRANSCRIPT, READ-ONLY — ported in role from the old AI transcript extension: a recording (a sermon, a talk) chosen
// on the device, decoded here, cut into chunks and transcribed by the serving plane's speech model, read back as
// text with its minutes, every Scripture reference in it a link. Nothing is kept anywhere unless the reader saves the
// text as a note of their own; the audio never leaves the estate and nothing is sent to any other service.
import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import type { ExtensionRegistration } from "../host";
import type { ReaderState } from "../../state";
import { useI18n } from "../../i18n";
import { A2A_BASE } from "../../api";
import { scanVerseReferencesInText } from "@seed/scripture";
import {
  chunkPcm,
  clock,
  mergeSegments,
  resample,
  toMono,
  wavEncode,
  type TranscriptSegment,
} from "./audio";

interface Job {
  name: string;
  total: number;
  done: number;
  segments: TranscriptSegment[];
  error: string | null;
}
const job = signal<Job | null>(null);

/** One chunk to the workspace's transcribe lane; the text back. */
export async function transcribeChunk(
  wav: Uint8Array,
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(`${A2A_BASE}/api/transcribe`, {
    method: "POST",
    headers: { "content-type": "audio/wav", authorization: `Bearer ${token}` },
    body: wav.slice().buffer as ArrayBuffer,
  });
  const out = (await res.json().catch(() => null)) as {
    ok?: boolean;
    text?: string;
    error?: string;
  } | null;
  if (!res.ok || !out?.ok)
    throw new Error(out?.error ?? `transcription answered ${res.status}`);
  return out.text ?? "";
}

async function decodeFile(file: File): Promise<Float32Array> {
  const Ctx = (
    globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }
  ).OfflineAudioContext;
  if (!Ctx) throw new Error("this browser cannot decode audio");
  const bytes = await file.arrayBuffer();
  const probe = new Ctx(1, 1, 48_000);
  const decoded = await probe.decodeAudioData(bytes);
  const channels: Float32Array[] = [];
  for (let i = 0; i < decoded.numberOfChannels; i++)
    channels.push(decoded.getChannelData(i));
  return resample(toMono(channels), decoded.sampleRate);
}

export async function runTranscription(file: File, token: string) {
  const pcm = await decodeFile(file);
  const chunks = chunkPcm(pcm);
  job.value = {
    name: file.name,
    total: chunks.length,
    done: 0,
    segments: [],
    error: null,
  };
  const parts: Array<{ startSeconds: number; text: string }> = [];
  for (const chunk of chunks) {
    try {
      const text = await transcribeChunk(wavEncode(chunk.samples), token);
      parts.push({ startSeconds: chunk.startSeconds, text });
      job.value = {
        ...job.value!,
        done: parts.length,
        segments: mergeSegments(parts),
      };
    } catch (e) {
      job.value = {
        ...job.value!,
        error: e instanceof Error ? e.message : String(e),
      };
      return;
    }
  }
}

function Linked({ state, text }: { state: ReaderState; text: string }) {
  const refs = scanVerseReferencesInText(text, state.reading.books.value);
  if (!refs.length) return <>{text}</>;
  const out: preact.ComponentChildren[] = [];
  let at = 0;
  for (const m of refs) {
    out.push(text.slice(at, m.start));
    const r = m.ref;
    out.push(
      <button
        key={m.start}
        type="button"
        className="sb-presence-where"
        onClick={() =>
          void state.reading
            .goTo(state.reading.translationId.value, r.book, r.chapter)
            .then(() => {
              if (r.verse)
                state.selection.select(r.verse, r.endVerse ?? r.verse);
            })
        }
      >
        {text.slice(m.start, m.end)}
      </button>
    );
    at = m.end;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

function TranscriptPane({ state }: { state: ReaderState }) {
  const { t } = useI18n();
  const j = job.value;
  const token = state.session.value?.token ?? null;
  const [saved, setSaved] = useState(false);
  const text = j
    ? j.segments.map((s) => `[${clock(s.startSeconds)}] ${s.text}`).join("\n\n")
    : "";
  return (
    <section
      className="sb-pane sb-transcript"
      aria-label={t("transcript", { defaultValue: "Transcript" })}
    >
      <header className="sb-pane-header">
        <h2>{t("transcript", { defaultValue: "Transcript" })}</h2>
        <button
          className="sb-pane-close"
          aria-label={t("close", { defaultValue: "Close" })}
          onClick={() => (state.ui.pane.value = "none")}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </header>
      {!token && (
        <p className="sb-small sb-muted">
          {t("transcript-sign-in", {
            defaultValue: "Sign in to transcribe a recording.",
          })}
        </p>
      )}
      <label className="sb-note-button">
        {t("transcript-pick", { defaultValue: "Choose a recording" })}
        <input
          type="file"
          accept="audio/*,video/mp4,video/webm"
          hidden
          disabled={!token}
          onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f && token) {
              setSaved(false);
              void runTranscription(f, token).catch(
                (err) =>
                  (job.value = {
                    name: f.name,
                    total: 0,
                    done: 0,
                    segments: [],
                    error: err instanceof Error ? err.message : String(err),
                  })
              );
            }
          }}
        />
      </label>
      <p className="sb-small sb-muted">
        {t("transcript-note", {
          defaultValue:
            "The recording is decoded on this device and sent in two-minute pieces to the estate's speech model; nothing is kept, and nothing goes to any other service.",
        })}
      </p>
      {j && (
        <>
          <p className="sb-small">
            <strong>{j.name}</strong> ·{" "}
            {j.done < j.total
              ? t("transcript-progress", {
                  done: j.done,
                  total: j.total,
                  defaultValue: `${j.done} of ${j.total} pieces`,
                })
              : t("transcript-done", { defaultValue: "done" })}
            {j.error ? ` · ${j.error}` : ""}
          </p>
          <div className="sb-transcript-text">
            {j.segments.map((s) => (
              <p key={s.startSeconds}>
                <span className="sb-muted sb-small">
                  [{clock(s.startSeconds)}]
                </span>{" "}
                <Linked state={state} text={s.text} />
              </p>
            ))}
          </div>
          {j.segments.length > 0 && (
            <div className="sb-note-card-actions">
              <button
                className="sb-note-button"
                onClick={() => void navigator.clipboard?.writeText(text)}
              >
                {t("copy", { defaultValue: "Copy" })}
              </button>
              <button
                className="sb-note-button sb-note-button-primary"
                disabled={saved}
                onClick={() => {
                  const r = state.reading;
                  const html =
                    `<p><strong>${t("transcript-of", { name: j.name, defaultValue: `Transcript of ${j.name}` })}</strong></p>` +
                    j.segments
                      .map(
                        (s) =>
                          `<p>[${clock(s.startSeconds)}] ${s.text.replace(/</g, "&lt;")}</p>`
                      )
                      .join("");
                  const v = state.selection.verses.value;
                  void state.annotations
                    .add(
                      r.chapterRef.value,
                      v[0] ?? 1,
                      v[v.length - 1] ?? v[0] ?? 1,
                      html
                    )
                    .then(() => setSaved(true));
                }}
              >
                {saved
                  ? t("saved", { defaultValue: "Saved" })
                  : t("transcript-save-note", {
                      defaultValue: "Save as a note on this chapter",
                    })}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const transcriptExtension: ExtensionRegistration = {
  id: "transcript",
  label: "Transcript",
  description:
    "Transcribe a recording with the estate's speech model; Scripture references become links.",
  defaultEnabled: false,
  init: function* (ctx) {
    const { state } = ctx;
    yield ctx.panes.register({
      id: "transcript",
      title: "Transcript",
      render: () => <TranscriptPane state={state} />,
    });
    yield ctx.toolbar.add({
      id: "transcript",
      label: "Transcript",
      icon: "record_voice_over",
      onSelect: () => ctx.panes.open("transcript"),
    });
  },
};
export default transcriptExtension;
