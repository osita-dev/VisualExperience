/**
 * ON-DEVICE PROCESSING — ffmpeg.wasm, vendored, zero backend.
 *
 * The single-threaded core (public/ffmpeg/ffmpeg-core.js + .wasm) is
 * served from our own origin, so no COOP/COEP headers and no
 * SharedArrayBuffer are needed — it runs on plain static hosting. The
 * worker itself is bundled by Vite from @ffmpeg/ffmpeg (it must not be
 * loaded from a CDN — the worker can't be spawned cross-origin).
 *
 * Scope: prepare clips the browser would otherwise refuse — videos the
 * <video> element cannot decode (HEVC on Windows Chrome, odd containers)
 * are transcoded to H.264 + AAC entirely on-device. Nothing is uploaded.
 * Also backs the WebCodecs-less EXPORT fallback (see @/exporter/ffmpegExport).
 *
 * Memory: single-threaded wasm cannot be unloaded, so the instance is a
 * module-level singleton, jobs run one at a time through a promise
 * queue, and MEMFS is wiped after every job.
 */

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { OUT_NAME, convertArgs, convertedName, inNameFor } from "@/lib/convert";

/** Progress of one conversion: 0..1, straight from ffmpeg. */
export type ProgressFn = (ratio: number) => void;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;
/** jobs run strictly one at a time — one MEMFS, no interleaving */
let queue: Promise<unknown> = Promise.resolve();

/** Best-effort wipe of the virtual filesystem between jobs. */
async function wipeMemfs(ff: FFmpeg, names: string[]): Promise<void> {
  for (const name of names) {
    try {
      await ff.deleteFile(name);
    } catch {
      /* never written / already gone — always proceed */
    }
  }
}

/**
 * Load (once, ever) the vendored single-threaded core from our own
 * origin. Concurrent callers share one load; a failed load is not
 * cached, so it can be retried.
 */
export function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (!loadPromise) {
    const ff = new FFmpeg();
    loadPromise = ff
      .load({
        coreURL: new URL("ffmpeg/ffmpeg-core.js", document.baseURI).href,
        wasmURL: new URL("ffmpeg/ffmpeg-core.wasm", document.baseURI).href,
      })
      .then(() => {
        ffmpeg = ff;
        return ff;
      })
      .catch((err) => {
        loadPromise = null;
        throw new Error(
          `ffmpeg failed to start (${err instanceof Error ? err.message : String(err)})`,
        );
      });
  }
  return loadPromise;
}

/**
 * Transcode a picked video into H.264 + AAC MP4 on-device: the browser
 * decodes it everywhere, and "Keep original sound" keeps working because
 * the audio track survives. Returns a new File; the input is untouched.
 * Runs after any in-flight job (single wasm queue).
 */
export function convertVideo(
  input: File,
  onProgress?: ProgressFn,
): Promise<File> {
  const job = queue.then(async () => {
    const ff = await getFFmpeg();
    const inName = inNameFor(input.name); // MEMFS: fixed, derived from input
    const outName = OUT_NAME; // MEMFS: fixed name — no collisions

    const onProg = ({
      progress,
    }: {
      progress: number;
      time: number;
    }): void => {
      if (onProgress && Number.isFinite(progress)) {
        onProgress(Math.min(1, Math.max(0, progress)));
      }
    };
    ff.on("progress", onProg);
    try {
      await ff.writeFile(inName, await fetchFile(input));
      // exec resolves with ffmpeg's exit code; 0 = success
      const code = await ff.exec(convertArgs(inName, outName));
      if (code !== 0) {
        throw new Error(`ffmpeg exited with code ${code}`);
      }
      const data = await ff.readFile(outName);
      if (!(data instanceof Uint8Array)) {
        throw new Error("ffmpeg produced no output");
      }
      // copy out of the wasm heap so MEMFS can be wiped safely
      const bytes = new Uint8Array(data);
      return new File([bytes], convertedName(input.name), {
        type: "video/mp4",
      });
    } finally {
      ff.off("progress", onProg);
      await wipeMemfs(ff, [inName, outName]);
    }
  });
  // keep the queue alive even when this job fails
  queue = job.catch(() => undefined);
  return job;
}
