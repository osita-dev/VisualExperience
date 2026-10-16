/**
 * OFFLINE AUDIO RENDER (WebCodecs export path).
 *
 * The realtime AudioEngine is anchored to `ctx.currentTime` and pulls clip
 * sound from live <video> elements — perfect for MediaRecorder, useless for
 * WebCodecs (which is not real-time). This module renders the ENTIRE mix —
 * tone/local music, SFX, and each clip's "original sound" — into one PCM
 * AudioBuffer via OfflineAudioContext, at exact absolute times. It reuses the
 * very same synth generators (BaseAudioContext ⇒ runs offline unchanged), so
 * what you preview is what lands in the file.
 */

import type { Schedule } from "@/core/model/types";
import { isToneTrack, toneTrackId } from "@/core/model/types";
import { getTone } from "@/core/audio/tones";
import { synthTone, synthSfx } from "@/player/synth";
import { buildMediaPlan, type Bindings } from "@/player/frame";
import { audio } from "@/player/audio";

const MUSIC_BASE = 0.9;
const DUCK = 0.35;
const SR = 48_000;

/** Decode a binding's original audio from its blob URL (null if none/failed). */
async function decodeClipAudio(
  ctx: OfflineAudioContext,
  url: string,
): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return null;
    return await ctx.decodeAudioData(buf);
  } catch {
    return null; // photo, no audio track, or undecodable — clip stays silent
  }
}

/**
 * Render the full mix offline. Returns null only when there is genuinely no
 * audio (no music entry, no SFX, no clip sound) — the caller then exports a
 * silent (video-only) file.
 */
export async function renderAudioOffline(
  schedule: Schedule,
  bindings: Bindings,
  soundOn: Record<string, boolean> | undefined,
): Promise<AudioBuffer | null> {
  const dur = Math.max(0.1, schedule.duration);
  const hasMusic = schedule.entries.some((e) => e.kind === "music");
  const hasSfx = schedule.entries.some((e) => e.kind === "audio");
  const plan = buildMediaPlan(schedule);
  const sounding = plan.filter((it) => soundOn?.[it.slotId]);
  if (!hasMusic && !hasSfx && sounding.length === 0) return null;

  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const musicGain = ctx.createGain();
  musicGain.gain.value = MUSIC_BASE;
  const sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  const clipGain = ctx.createGain();
  clipGain.gain.value = 1;
  musicGain.connect(master);
  sfxGain.connect(master);
  clipGain.connect(master);

  // ---- music (tone or a local song already registered by the UI) ----
  const musicEntry = schedule.entries.find((e) => e.kind === "music");
  if (musicEntry) {
    const track = String(musicEntry.params.track);
    let buf: AudioBuffer | null = null;
    let loop = false;
    let winStart = 0;
    let winEnd = 0;
    if (isToneTrack(track)) {
      const tone = getTone(toneTrackId(track));
      if (tone) {
        buf = synthTone(ctx, tone);
        loop = tone.loop;
      }
    } else {
      buf = audio.getTrack(track) ?? null;
      if (buf) {
        // the very same video-length window the preview plays (D50) —
        // identical math on both sides keeps preview ≡ export
        winStart = Math.min(
          Math.max(0, Number(musicEntry.params.offset ?? 0)),
          Math.max(0, buf.duration - 0.05),
        );
        const winLen = Math.max(0.05, Math.min(dur, buf.duration - winStart));
        winEnd = winStart + winLen;
        loop = winLen < dur - 0.05;
      }
    }
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = loop;
      if (winEnd > winStart) {
        src.loopStart = winStart;
        src.loopEnd = winEnd;
      }
      const g = ctx.createGain();
      g.gain.value = Number(musicEntry.params.volume ?? MUSIC_BASE);
      src.connect(g);
      g.connect(musicGain);
      src.start(0, winStart);
    }
  }

  // ---- SFX — fired at their exact schedule time ----
  for (const e of schedule.entries) {
    if (e.kind !== "audio") continue;
    const buf = synthSfx(ctx, e.target);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Number(e.params.volume ?? 1);
    src.connect(g);
    g.connect(sfxGain);
    src.start(Math.max(0, Math.min(e.t, dur)));
  }

  // ---- clip original sound + duck the music while it plays ----
  await Promise.all(
    sounding.map(async (it) => {
      const b = bindings[it.slotId];
      if (!b || b.type !== "video") return;
      const clipBuf = await decodeClipAudio(ctx, b.url);
      if (!clipBuf) return;
      const start = Math.max(0, Math.min(it.start, dur));
      const end = Math.max(start, Math.min(it.end, dur));
      const winLen = end - start;
      if (winLen <= 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = clipBuf;
      src.connect(clipGain);
      // align to the clip's audible position (its trim in-point), windowed
      src.start(start, Math.max(0, Math.min(it.trimStart, clipBuf.duration)), winLen);
      // duck envelope on the music bus
      const mg = musicGain.gain;
      mg.setValueAtTime(MUSIC_BASE, start);
      mg.linearRampToValueAtTime(MUSIC_BASE * DUCK, start + 0.06);
      mg.setValueAtTime(MUSIC_BASE * DUCK, end);
      mg.linearRampToValueAtTime(MUSIC_BASE, Math.min(dur, end + 0.06));
    }),
  );

  return await ctx.startRendering();
}
