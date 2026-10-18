/**
 * EXPORT TIER 2 — ffmpeg.wasm fallback (NO MediaRecorder).
 *
 * Runs only when the browser can't hardware-encode H.264 via WebCodecs. It
 * uses the SAME deterministic frame loop as Tier 1 — draw frame at time `t`,
 * capture it — but encodes in software with the vendored single-threaded
 * ffmpeg core: a numbered JPEG sequence (+ the offline-rendered audio as WAV)
 * → MP4 H.264/AAC. Because software H.264 in wasm is slow and memory-hungry,
 * the fallback renders at a bounded 720×1280 @ 24fps so it always finishes.
 * The app already caps the total at MAX_TOTAL_SEC (300s), which bounds the frame count too.
 */

import { fetchFile } from "@ffmpeg/util";
import { getFFmpeg } from "@/lib/ffmpeg";
import { OUT_NAME, frameSequenceArgs } from "@/lib/convert";
import type { Schedule } from "@/core/model/types";
import { FrameRenderer, syncMedia, type Bindings } from "@/player/frame";
import { renderAudioOffline } from "@/exporter/offlineAudio";
import { audioBufferToWav } from "@/exporter/wav";
import { loadScheduleFonts, loadBindingsMedia, settleSeeked } from "@/exporter/prep";

const FPS = 24;
const FALLBACK_W = 720; // bounded so wasm memory stays sane
const FALLBACK_H = Math.round((FALLBACK_W * 16) / 9); // 1280

export interface FfmpegExportOptions {
  canvas: HTMLCanvasElement;
  schedule: Schedule;
  bindings: Bindings;
  soundOn?: Record<string, boolean>;
  onProgress: (fraction: number) => void;
  signal?: { cancelled: boolean };
}

const capture = (c: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));

const pad5 = (n: number): string => String(n).padStart(5, "0");

export async function exportFfmpegFallback(
  opts: FfmpegExportOptions,
): Promise<{ blob: Blob; ext: "mp4" }> {
  const { canvas, schedule, bindings, soundOn } = opts;
  const renderer = new FrameRenderer();

  await Promise.all([loadScheduleFonts(schedule), loadBindingsMedia(bindings)]);

  const oldW = canvas.width;
  const oldH = canvas.height;
  canvas.width = FALLBACK_W;
  canvas.height = FALLBACK_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = oldW;
    canvas.height = oldH;
    throw new Error("Couldn't open the canvas for export.");
  }

  const written: string[] = [];
  try {
    const ff = await getFFmpeg();

    // ---- audio: offline mix → WAV (optional) ----
    let hasAudio = false;
    const audioBuf = await renderAudioOffline(schedule, bindings, soundOn);
    if (audioBuf) {
      await ff.writeFile("audio.wav", await fetchFile(audioBufferToWav(audioBuf)));
      hasAudio = true;
    }

    // ---- step every frame, capture as JPEG into MEMFS ----
    const dur = Math.max(0.1, schedule.duration);
    const frameDur = 1 / FPS;
    const total = Math.max(1, Math.ceil(dur * FPS));
    for (let i = 0; i < total; i++) {
      if (opts.signal?.cancelled) break;
      const t = i * frameDur;
      const seeks = syncMedia(schedule, bindings, t, false, true);
      await settleSeeked(seeks, bindings);
      renderer.render(ctx, FALLBACK_W, FALLBACK_H, schedule, bindings, t);
      const jpeg = await capture(canvas);
      if (jpeg) {
        const name = `f${pad5(i + 1)}.jpg`;
        await ff.writeFile(name, await fetchFile(jpeg));
        written.push(name);
      }
      opts.onProgress((i + 1) / total);
    }

    // ---- encode the sequence (+audio) to MP4 ----
    if (written.length === 0) {
      throw new Error("Export produced no frames.");
    }
    const code = await ff.exec(frameSequenceArgs(FPS, hasAudio));
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const data = await ff.readFile(OUT_NAME);
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new Error("Export produced an empty file.");
    }
    const bytes = new Uint8Array(data); // copy out of the wasm heap
    return { blob: new Blob([bytes], { type: "video/mp4" }), ext: "mp4" };
  } finally {
    // wipe MEMFS (frames, audio, output) and restore preview state
    const ff = (await getFFmpeg().catch(() => null)) as
      | { deleteFile: (n: string) => Promise<unknown> }
      | null;
    if (ff) {
      for (const n of written) await ff.deleteFile(n).catch(() => undefined);
      await ff.deleteFile("audio.wav").catch(() => undefined);
      await ff.deleteFile(OUT_NAME).catch(() => undefined);
    }
    syncMedia(schedule, bindings, 0, false, true);
    canvas.width = oldW;
    canvas.height = oldH;
  }
}
