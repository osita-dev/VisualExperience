/**
 * Media ingest — probe, thumbnail and warn. Users bring photos/videos;
 * nothing is transcoded: browsers decode natively and the renderer crops.
 */

export interface ProbedMedia {
  file: File;
  url: string;
  isVideo: boolean;
  /** seconds; Infinity for images */
  duration: number;
  width: number;
  height: number;
  /** small JPEG dataURL for cards and My Projects */
  thumb: string;
}

const MAX_THUMB = 160;

function thumbFrom(
  src: CanvasImageSource,
  sw: number,
  sh: number,
): string {
  const canvas = document.createElement("canvas");
  const k = Math.min(MAX_THUMB / sw, MAX_THUMB / sh);
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  // center-crop to square-ish frame for the card thumb
  const cover = Math.max(canvas.width / sw, canvas.height / sh);
  const dw = sw * cover;
  const dh = sh * cover;
  ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/** Probe a picked file. Throws with a human-readable message on failure. */
export function probeFile(file: File): Promise<ProbedMedia> {
  if (isVideoFile(file)) return probeVideo(file);
  if (isImageFile(file)) return probeImage(file);
  return Promise.reject(
    new Error("That file type isn't supported — pick a photo or video."),
  );
}

function probeImage(file: File): Promise<ProbedMedia> {
  const url = URL.createObjectURL(file);
  return new Promise<ProbedMedia>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        file,
        url,
        isVideo: false,
        duration: Infinity,
        width: img.naturalWidth,
        height: img.naturalHeight,
        thumb: thumbFrom(img, img.naturalWidth, img.naturalHeight),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image — try another file."));
    };
    img.src = url;
  });
}

function probeVideo(file: File): Promise<ProbedMedia> {
  const url = URL.createObjectURL(file);
  return new Promise<ProbedMedia>((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    const fail = (msg: string) => {
      URL.revokeObjectURL(url);
      reject(new Error(msg));
    };
    v.onerror = () => fail("Couldn't read that video — try another file.");
    v.onloadedmetadata = () => {
      const duration = Number.isFinite(v.duration) ? v.duration : 0;
      const seekTo = Math.min(0.12, duration * 0.1);
      v.onseeked = () => {
        resolve({
          file,
          url,
          isVideo: true,
          duration,
          width: v.videoWidth,
          height: v.videoHeight,
          thumb: thumbFrom(v, v.videoWidth, v.videoHeight),
        });
      };
      v.onerror = () => fail("Couldn't decode that video.");
      try {
        v.currentTime = seekTo;
      } catch {
        // Some containers refuse the seek — resolve without a perfect thumb.
        resolve({
          file,
          url,
          isVideo: true,
          duration,
          width: v.videoWidth,
          height: v.videoHeight,
          thumb: "",
        });
      }
    };
    v.src = url;
  });
}

/**
 * Kind warning messages (Stage 05 states). `slotDur` is DERIVED from beats —
 * the app never asks users for a duration.
 */
export function mediaWarnings(
  m: ProbedMedia,
  slotDur: number,
): { id: string; message: string }[] {
  const out: { id: string; message: string }[] = [];
  if (m.isVideo && m.duration + 0.05 < slotDur) {
    out.push({
      id: "short",
      message: `Clip is shorter than its ${slotDur.toFixed(1)}s slot — the last frame will hold.`,
    });
  }
  if (!m.isVideo) {
    const aspect = m.width / m.height;
    const target = 9 / 16;
    if (Math.abs(aspect - target) > 0.12) {
      out.push({
        id: "crop",
        message:
          aspect < target
            ? "Photo is narrower than 9:16 — it will be cropped top and bottom."
            : "Photo is wider than 9:16 — it will be cropped on the sides (center focus).",
      });
    }
  } else if (m.width > 0 && Math.abs(m.width / m.height - 9 / 16) > 0.2) {
    out.push({
      id: "crop-video",
      message: "Video doesn't match 9:16 — it will be cropped to fit.",
    });
  }
  return out;
}

/** Max trim start for the fixed, beat-locked window (never typed). */
export function maxTrimStart(m: ProbedMedia, slotDur: number): number {
  if (m.isVideo) return Math.max(0, m.duration - slotDur);
  return 0;
}

/** Human progress while an on-device conversion runs (Step 4). */
export type IngestStatus = (message: string, progress?: number) => void;

/**
 * Ingest a picked file (Step 4): probe it normally; only if the browser
 * REFUSES to decode a video (HEVC on Windows Chrome, exotic containers…)
 * is it transcoded on-device with the vendored ffmpeg.wasm core — nothing
 * is uploaded, no service is contacted — and the result is probed again.
 * Photos and already-working videos never touch ffmpeg. `onStatus`
 * reports the human message and progress (0..1) while converting.
 */
export async function ingestFile(
  file: File,
  onStatus?: IngestStatus,
): Promise<ProbedMedia> {
  try {
    return await probeFile(file);
  } catch (err) {
    if (!isVideoFile(file)) throw err; // images: honest error, no rescue path
    // the browser couldn't decode this video — prepare it on-device
    const { convertVideo } = await import("@/lib/ffmpeg");
    const msg = "Preparing clip on your device…";
    onStatus?.(msg, 0);
    let converted: File;
    try {
      converted = await convertVideo(file, (ratio) => onStatus?.(msg, ratio));
    } catch (e) {
      throw new Error(
        `That video couldn't be prepared on your device (${e instanceof Error ? e.message : String(e)}). Try another file or export it as MP4 (H.264).`,
      );
    }
    try {
      return await probeFile(converted);
    } catch {
      throw new Error(
        "That video couldn't be decoded even after preparing — try another file.",
      );
    }
  }
}
