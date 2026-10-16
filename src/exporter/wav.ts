/**
 * Pure WAV (16-bit PCM) encoding — no DOM, no AudioBuffer required — so the
 * ffmpeg.wasm fallback can turn the offline-rendered mix into a file ffmpeg
 * reads natively, and scripts/verify-core.ts can test the byte layout.
 */

/** Interleave float channels (−1..1) into a RIFF/WAVE ArrayBuffer. */
export function encodePcm16Wav(
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const numCh = Math.min(2, channels.length) || 1;
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * numCh * 2;
  const total = 44 + dataBytes;
  const ab = new ArrayBuffer(total);
  const view = new DataView(ab);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, total - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true); // byte rate
  view.setUint16(32, numCh * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  view.setUint32(40, dataBytes, true);

  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return ab;
}

/** AudioBuffer → WAV Blob (the ffmpeg fallback's audio input). */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const chans: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    chans.push(buffer.getChannelData(c));
  }
  return new Blob([encodePcm16Wav(chans, buffer.sampleRate)], {
    type: "audio/wav",
  });
}
