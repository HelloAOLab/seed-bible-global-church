import { useEffect } from "preact/hooks";
import { signal } from "@preact/signals";
import type { QuickConnectIdentity } from "@agenticprimitives/connect-client";
import { askAgent, listDevReaders, sayHello, type DevReader } from "./api";
import {
  DEFAULT_ESTATE,
  DEV_READER_AVAILABLE,
  HOME_SIGNIN_AVAILABLE,
  CLIENT_ID,
  completeRedirectIfReturning,
  connectAsSamplePerson,
  connectViaHome,
  listSamplePeople,
  loadSession,
  signInAsDevReader,
  signOut,
  type ReaderSession,
} from "./session";
import { TOWN, estateById } from "../../../estate/faithnet";

const session = signal<ReaderSession | null>(loadSession());
const progress = signal<string>("");
const samplePeople = signal<QuickConnectIdentity[]>([]);
const devReaders = signal<DevReader[]>([]);
const greeting = signal<string>("");
const runRef = signal<string>("");
const error = signal<string>("");

function report(e: unknown) {
  error.value = e instanceof Error ? e.message : String(e);
}

async function onHome() {
  error.value = "";
  try {
    const s = await connectViaHome(DEFAULT_ESTATE, (m) => (progress.value = m));
    if (s) session.value = s;
  } catch (e) {
    report(e);
  } finally {
    progress.value = "";
  }
}

async function onSample(handle: string) {
  error.value = "";
  try {
    session.value = await connectAsSamplePerson(DEFAULT_ESTATE, handle);
  } catch (e) {
    report(e);
  }
}

function onDev(r: DevReader) {
  error.value = "";
  session.value = signInAsDevReader(r.handle, r.name, r.sa);
}

function onSignOut() {
  signOut();
  session.value = null;
  greeting.value = "";
  runRef.value = "";
}

async function onHello() {
  error.value = "";
  greeting.value = "";
  runRef.value = "";
  const s = session.value;
  try {
    if (s) {
      // Signed in: one harness run on the agent's own object, as the reader.
      const out = await askAgent(s.token, "hello");
      if (!out.ok || !out.reply)
        throw new Error(out.error ?? "the reader agent did not answer");
      if (out.reply.kind !== "answer")
        throw new Error(
          out.reply.error ??
            out.reply.text ??
            `the reader agent replied ${out.reply.kind}`
        );
      greeting.value = out.reply.text ?? "";
      runRef.value = out.runRef ?? "";
    } else {
      const out = await sayHello(null);
      if (!out.ok)
        throw new Error(out.error ?? "the reader agent did not answer");
      greeting.value = out.greeting ?? "";
    }
  } catch (e) {
    report(e);
  }
}

export function App() {
  useEffect(() => {
    completeRedirectIfReturning()
      .then((s) => {
        if (s) session.value = s;
      })
      .catch(report);
    listSamplePeople(DEFAULT_ESTATE).then((p) => (samplePeople.value = p));
    if (DEV_READER_AVAILABLE)
      listDevReaders().then((r) => (devReaders.value = r));
  }, []);

  const estate = estateById(DEFAULT_ESTATE)!;
  const s = session.value;

  return (
    <main class="page">
      <header>
        <h1>Seed Bible · Reader</h1>
        <p class="muted">
          Hello world on the <strong>{TOWN.label}</strong> town (chain{" "}
          {TOWN.chainId}) · the <strong>{estate.label}</strong> estate · Home{" "}
          <a href={estate.home}>{estate.homeHost}</a>
        </p>
      </header>

      {error.value && <p class="error">{error.value}</p>}

      {s ? (
        <section class="card">
          <h2>Connected</h2>
          <p>
            <strong>{s.name || s.sub}</strong>
            <br />
            <span class="muted small">
              {s.sub} · via {s.via}
            </span>
            <br />
            <span class="muted small">
              {s.wire
                ? "Your agent may keep your reading record in your Library (ask-as-me wire held by the reader workspace)."
                : (s.wireNote ?? "No wire: reading stays local-only.")}
            </span>
          </p>
          <button onClick={onSignOut}>Sign out</button>
        </section>
      ) : (
        <section class="card">
          <h2>Connect</h2>
          <p class="muted">
            Sign in with your Home. This page holds no key; your Home does the
            ceremony.
          </p>
          <button onClick={onHome} disabled={!HOME_SIGNIN_AVAILABLE}>
            Sign in with {estate.label}
          </button>
          {!HOME_SIGNIN_AVAILABLE && (
            <p class="muted small">
              Not registered yet: the Home needs the client{" "}
              <code>{CLIENT_ID}</code> with this origin and a relying delegate
              (set
              <code> VITE_CONNECT_DELEGATE</code>).
            </p>
          )}
          {progress.value && <p class="muted small">{progress.value}</p>}
          {samplePeople.value.length > 0 && (
            <details open>
              <summary>Or try it as one of the Home's sample people</summary>
              <ul class="people">
                {samplePeople.value.map((p) => (
                  <li key={p.handle}>
                    <button onClick={() => onSample(p.handle)}>{p.name}</button>
                    <span class="muted small"> {p.blurb}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {devReaders.value.length > 0 && (
            <details open>
              <summary>Local dev: the seed demo reader</summary>
              <ul class="people">
                {devReaders.value.map((r) => (
                  <li key={r.handle}>
                    <button onClick={() => onDev(r)}>{r.name}</button>
                    <span class="muted small"> dev reader · {r.sa}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <section class="card">
        <h2>Say hello</h2>
        <p class="muted small">
          {s
            ? "One harness run on the reader agent's own object, as you (reader-web → reader-a2a → reader-mcp)."
            : "As a stranger: reader-web → reader-a2a → reader-mcp."}
        </p>
        <button onClick={onHello}>Hello</button>
        {greeting.value && (
          <p class="greeting">
            {greeting.value}
            {runRef.value && (
              <span class="muted small">
                <br />
                run {runRef.value}
              </span>
            )}
          </p>
        )}
      </section>
    </main>
  );
}
