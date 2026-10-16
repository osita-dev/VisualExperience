/**
 * EXPORT TIER 1 — WebCodecs (hardware H.264) via Mediabunny.
 *
 * Draws every frame at an exact time (deterministic, NOT real-time bound),
 * hands it to the browser's hardware H.264 encoder through Mediabunny's
 * CanvasSource, muxes in an offline-rendered AAC audio track, and returns a
 * real MP4. Preview ≡ export holds even tighter than real-time recording,
 * because each frame is captured at its exact timestamp. No wasm, no upload.
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  canEncodeVideo,
  canEncodeAudio,
} from "mediabunny";
import type { Schedule } from "@/core/model/types";
import { FrameRenderer, syncMedia, type Bindings } from "@/player/frame";
import { renderAudioOffline } from "@/exporter/offlineAudio";
import { loadScheduleFonts, loadBindingsMedia, settleSeeked } from "@/exporter/prep";

const FPS = 30;

export interface WebCodecsOptions {
  canvas: HTMLCanvasElement;
  schedule: Schedule;
  bindings: Bindings;
  soundOn?: Record<string, boolean>;
  width: number;
  height: number;
  onProgress: (fraction: number) => void;
  signal?: { cancelled: boolean };
}

/** True when this browser can hardware-encode H.264 video AND AAC audio. */
export async function supportsWebCodecsExport(): Promise<boolean> {
  try {
    const [v, a] = await Promise.all([
      canEncodeVideo("avc", { bitrate: 12_000_000, frameRate: FPS }),
      canEncodeAudio("aac", { bitrate: 128_000, sampleRate: 48_000, numberOfChannels: 2 }),
    ]);
    return v && a;
  } catch {
    return false;
  }
}

export async function exportWebCodecs(
  opts: WebCodecsOptions,
): Promise<{ blob: Blob; ext: "mp4" }> {
  const { canvas, schedule, bindings, width, height } = opts;
  const renderer = new FrameRenderer();

  await Promise.all([loadScheduleFonts(schedule), loadBindingsMedia(bindings)]);

  const oldW = canvas.width;
  const oldH = canvas.height;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = oldW;
    canvas.height = oldH;
    throw new Error("Couldn't open the canvas for export.");
  }

  try {
    // ---- audio: render the whole mix offline (null ⇒ silent export) ----
    const audioBuf = await renderAudioOffline(schedule, bindings, opts.soundOn);

    const bitrate = width >= 1080 ? 12_000_000 : 8_000_000;
    const output = new Output({
      format: new Mp4OutputFormat(),
      target: new BufferTarget(),
    });

    const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate });
    output.addVideoTrack(videoSource, { frameRate: FPS });

    let audioSource: AudioBufferSource | null = null;
    if (audioBuf) {
      audioSource = new AudioBufferSource({ codec: "aac", bitrate: 128_000 });
      output.addAudioTrack(audioSource);
    }

    await output.start();

    // ---- step every frame at its exact time ----
    const dur = Math.max(0.1, schedule.duration);
    const frameDur = 1 / FPS;
    const total = Math.max(1, Math.ceil(dur * FPS));
    for (let i = 0; i < total; i++) {
      if (opts.signal?.cancelled) break;
      const t = i * frameDur;
      const seeks = syncMedia(schedule, bindings, t, false, true); // park clips at t
      await settleSeeked(seeks, bindings); // wait for the seeks to land
      renderer.render(ctx, width, height, schedule, bindings, t);
      await videoSource.add(t, frameDur); // capture + hardware-encode (backpressure)
      opts.onProgress((i + 1) / total);
    }

    // ---- mux the offline audio in ----
    if (audioSource && audioBuf) {
      await audioSource.add(audioBuf);
    }

    await output.finalize();

    const target = output.target as BufferTarget;
    const buf = target.buffer;
    if (!buf || buf.byteLength === 0) {
      throw new Error("Export produced an empty file.");
    }
    return { blob: new Blob([buf], { type: "video/mp4" }), ext: "mp4" };
  } finally {
    // restore preview state
    syncMedia(schedule, bindings, 0, false, true);
    canvas.width = oldW;
    canvas.height = oldH;
  }
}
