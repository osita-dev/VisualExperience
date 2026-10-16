/**
 * Local music plumbing (D40): IndexedDB blob → decoded AudioBuffer →
 * engine registration under its `local:<fileId>` track key. Exactly one
 * local track stays decoded at a time (songs are tens of MB of PCM), and
 * everything runs on-device — no file ever leaves the browser.
 */

import { toast } from "sonner";
import { isLocalTrack, localTrackId } from "@/core/model/types";
import { getMusicRecord } from "@/hooks/useMusicDB";
import { audio } from "@/player/audio";

/** The local key currently held by the engine (for bounded memory). */
let activeLocalKey: string | null = null;
const warned = new Set<string>();

/**
 * Decode (if needed) and register a local track with the audio engine.
 * Resolves false when the file is missing or undecodable — callers surface
 * that honestly instead of pretending the music exists.
 */
export async function ensureLocalMusic(track: string): Promise<boolean> {
  if (!isLocalTrack(track)) return false;
  if (audio.hasTrack(track)) {
    activeLocalKey = track;
    return true;
  }
  try {
    const rec = await getMusicRecord(localTrackId(track));
    if (!rec) throw new Error("missing");
    const ctx = audio.ensure();
    const buffer = await ctx.decodeAudioData(await rec.blob.arrayBuffer());
    if (activeLocalKey && activeLocalKey !== track) audio.dropTrack(activeLocalKey);
    audio.registerTrack(track, buffer);
    activeLocalKey = track;
    warned.delete(track);
    return true;
  } catch {
    if (!warned.has(track)) {
      warned.add(track);
      toast.error(
        "The imported music file for this template is missing or unreadable — the video will render without it.",
      );
    }
    return false;
  }
}

/** Decode an audio file on-device (validates it + learns its duration). */
export async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const ctx = audio.ensure();
  return ctx.decodeAudioData(await blob.arrayBuffer());
}

/** Free the engine's current local song buffer (memory hygiene). */
export function releaseLocalMusic(): void {
  if (activeLocalKey) {
    audio.dropTrack(activeLocalKey);
    activeLocalKey = null;
  }
}

/** Blob → `data:` URL (for inlining music into exported .json files). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Couldn't read audio."));
    r.readAsDataURL(blob);
  });
}

/** `data:` URL → Blob (import side of the inline-audio round trip). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const head = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : "";
  const mime = /data:([^;,]+)/.exec(head)?.[1] ?? "audio/mpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
