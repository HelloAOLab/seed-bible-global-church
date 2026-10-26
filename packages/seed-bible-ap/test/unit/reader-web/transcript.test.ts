// The transcript's audio helpers: resampling to 16 kHz, chunking with start times, a valid WAV header, and merged
// segments in order.
import { describe, expect, it } from "vitest";
import {
  chunkPcm,
  clock,
  mergeSegments,
  resample,
  toMono,
  wavEncode,
  SAMPLE_RATE,
} from "../../../apps/reader-web/src/extensions/transcript/audio";

describe("transcript audio helpers", () => {
  it("resamples, mixes to mono, and chunks with start times", () => {
    const stereo = [
      new Float32Array([1, 1, 1, 1]),
      new Float32Array([0, 0, 0, 0]),
    ];
    expect([...toMono(stereo)]).toEqual([0.5, 0.5, 0.5, 0.5]);
    const at48k = new Float32Array(48_000 * 2).fill(0.25);
    const pcm = resample(at48k, 48_000);
    expect(pcm.length).toBe(SAMPLE_RATE * 2);
    expect(pcm[100]).toBeCloseTo(0.25);
    const chunks = chunkPcm(new Float32Array(SAMPLE_RATE * 250), 120);
    expect(chunks.map((c) => c.startSeconds)).toEqual([0, 120, 240]);
    expect(chunks[2]!.samples.length).toBe(SAMPLE_RATE * 10);
  });
  it("writes a 16-bit mono WAV the model can read", () => {
    const wav = wavEncode(new Float32Array([0, 1, -1, 0.5]));
    const d = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe("WAVE");
    expect(d.getUint16(22, true)).toBe(1);
    expect(d.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(d.getUint16(34, true)).toBe(16);
    expect(d.getInt16(46, true)).toBe(0x7fff);
    expect(d.getInt16(48, true)).toBe(-0x8000);
    expect(wav.length).toBe(44 + 8);
  });
  it("merges the chunks' text in order and prints a clock", () => {
    expect(
      mergeSegments([
        { startSeconds: 0, text: " In the beginning " },
        { startSeconds: 120, text: "" },
        { startSeconds: 240, text: "God created" },
      ])
    ).toEqual([
      { startSeconds: 0, text: "In the beginning" },
      { startSeconds: 240, text: "God created" },
    ]);
    expect(clock(125)).toBe("2:05");
  });
});
