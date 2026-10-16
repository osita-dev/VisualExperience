/**
 * Pure ffmpeg command builders (Step 4) — no DOM, no worker, no ffmpeg:
 * the exact args the on-device conversion runs, unit-tested by
 * scripts/verify-core.ts. The runtime that executes them lives in
 * `@/lib/ffmpeg`.
 */

/** Lowercased extension with a dot; ".mp4" when there isn't one. */
export function clipExt(name: string): string {
  const m = /\.[A-Za-z0-9]{1,5}$/.exec(name);
  return m ? m[0].toLowerCase() : ".mp4";
}

/** The virtual filename an input gets inside ffmpeg's MEMFS. */
export function inNameFor(name: string): string {
  return `in${clipExt(name)}`;
}

/** The virtual filename the converted output is written to. */
export const OUT_NAME = "out.mp4";

/**
 * Normalize any picked clip into a browser-safe MP4: H.264 yuv420p
 * (what every phone browser decodes), AAC audio kept so "Keep original
 * sound" still works, faststart for instant seeking. No scaling — the
 * canvas crops; the user's resolution is untouched. (`-nostdin -y` are
 * prepended by @ffmpeg/ffmpeg itself.)
 */
export function convertArgs(input: string, output: string): string[] {
  return [
    "-i", input,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    output,
  ];
}

/** The File name a converted clip lands as. */
export function convertedName(original: string): string {
  const base = original.replace(/\.[^.]+$/, "").trim() || "clip";
  return `${base}.mp4`;
}

/**
 * ffmpeg args for the WebCodecs-less FALLBACK export: a numbered JPEG frame
 * sequence (+ optional WAV audio) encoded to MP4 H.264/AAC. Pure — no MediaRecorder
 * anywhere; this is software encoding in wasm, run only when WebCodecs is absent.
 */
export function frameSequenceArgs(fps: number, hasAudio: boolean): string[] {
  const args = [
    "-y",
    "-framerate", String(fps),
    "-start_number", "1",
    "-i", "f%05d.jpg",
  ];
  if (hasAudio) args.push("-i", "audio.wav");
  args.push(
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "26",
    "-pix_fmt", "yuv420p",
  );
  if (hasAudio) args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  args.push("-movflags", "+faststart", OUT_NAME);
  return args;
}
