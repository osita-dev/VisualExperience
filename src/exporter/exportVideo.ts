/**
 * EXPORT — a two-tier, MediaRecorder-free pipeline. Both tiers draw the SAME
 * preview renderer frame-by-frame at exact timestamps (deterministic, preview ≡
 * export); they differ only in the encoder:
 *
 *   Tier 1  WebCodecs VideoEncoder  — hardware H.264 + AAC. Fast, the normal path.
 *   Tier 2  ffmpeg.wasm (vendored)  — software H.264. The rare fallback when the
 *                                     browser has no hardware H.264 encoder.
 *
 * Every export is a real MP4 (H.264 + AAC): plays on iPhone, Android, Windows.
 */

import type { Schedule } from "@/core/model/types";
import type { Bindings } from "@/player/frame";
import { exportWebCodecs, supportsWebCodecsExport } from "@/exporter/webcodecs";
import { exportFfmpegFallback } from "@/exporter/ffmpegExport";

export interface ExportSupport {
  ok: boolean;
  reason?: string;
  ext?: "mp4" | "webm";
}

/** Capability summary for the UI. Both engines produce MP4, and one of them
 *  is essentially always available (WebCodecs hardware, else vendored wasm),
 *  so export is always possible here. */
export function getExportSupport(): ExportSupport {
  return {
    ok: true,
    ext: "mp4",
    reason:
      "Exports as MP4 (H.264 + AAC) — plays everywhere. Uses your browser's hardware encoder when available.",
  };
}

export interface ExportOptions {
  canvas: HTMLCanvasElement;
  schedule: Schedule;
  bindings: Bindings;
  /** same map the preview uses — original sound must reach the file */
  soundOn?: Record<string, boolean>;
  width: number;
  height: number;
  onProgress: (fraction: number) => void;
  signal?: { cancelled: boolean };
}

export interface ExportResult {
  blob: Blob;
  ext: "mp4";
}

export async function exportVideo(opts: ExportOptions): Promise<ExportResult> {
  // Tier 1 — hardware WebCodecs (fast). Falls through if unsupported OR if a
  // hardware encode fails midway — a real file beats an error.
  if (await supportsWebCodecsExport()) {
    try {
      return await exportWebCodecs({
        canvas: opts.canvas,
        schedule: opts.schedule,
        bindings: opts.bindings,
        soundOn: opts.soundOn,
        width: opts.width,
        height: opts.height,
        onProgress: opts.onProgress,
        signal: opts.signal,
      });
    } catch {
      if (opts.signal?.cancelled) throw new Error("Export cancelled.");
      // otherwise fall through to the software fallback below
    }
  }
  // Tier 2 — ffmpeg.wasm software fallback (slow, guaranteed MP4).
  return exportFfmpegFallback({
    canvas: opts.canvas,
    schedule: opts.schedule,
    bindings: opts.bindings,
    soundOn: opts.soundOn,
    onProgress: opts.onProgress,
    signal: opts.signal,
  });
}
