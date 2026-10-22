// AUDIO FOR TRANSCRIPTION — pure helpers: a decoded track becomes 16 kHz mono PCM, cut into chunks the serving
// plane's speech model takes one at a time, each wrapped as a WAV file. No network here; the pane drives it.
export const SAMPLE_RATE = 16_000;
/** One chunk's length; a long sermon becomes many, transcribed in order. */
export const CHUNK_SECONDS = 120;

/** Mono samples at `from` Hz resampled to 16 kHz by linear interpolation (speech, not music). */
export function resample(mono: Float32Array, from: number): Float32Array {
  if (from === SAMPLE_RATE) return mono;
  const ratio = from / SAMPLE_RATE;
  const out = new Float32Array(Math.floor(mono.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, mono.length - 1);
    const t = x - i0;
    out[i] = (mono[i0] ?? 0) * (1 - t) + (mono[i1] ?? 0) * t;
  }
  return out;
}

/** Several channels averaged into one. */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const n = channels[0]!.length;
  const out = new Float32Array(n);
  for (const ch of channels)
    for (let i = 0; i < n; i++)
      out[i] = (out[i] ?? 0) + (ch[i] ?? 0) / channels.length;
  return out;
}

/** The chunks of a 16 kHz track, each with where it starts. */
export function chunkPcm(
  pcm: Float32Array,
  seconds = CHUNK_SECONDS
): Array<{ startSeconds: number; samples: Float32Array }> {
  const size = seconds * SAMPLE_RATE;
  const out: Array<{ startSeconds: number; samples: Float32Array }> = [];
  for (let at = 0; at < pcm.length; at += size)
    out.push({
      startSeconds: at / SAMPLE_RATE,
      samples: pcm.subarray(at, Math.min(at + size, pcm.length)),
    });
  return out;
}

/** A 16-bit mono WAV file of the samples. */
export function wavEncode(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE
): Uint8Array {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) data.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  data.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true);
  data.setUint32(28, sampleRate * 2, true);
  data.setUint16(32, 2, true);
  data.setUint16(34, 16, true);
  str(36, "data");
  data.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i] ?? 0));
    data.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(data.buffer);
}

export interface TranscriptSegment {
  startSeconds: number;
  text: string;
}

/** The chunks' answers in order, trimmed, with their start times. */
export function mergeSegments(
  parts: Array<{ startSeconds: number; text: string }>
): TranscriptSegment[] {
  return parts
    .map((p) => ({ startSeconds: p.startSeconds, text: p.text.trim() }))
    .filter((p) => p.text.length > 0);
}

export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
