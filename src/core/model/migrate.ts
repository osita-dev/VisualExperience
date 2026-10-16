/**
 * schemaVersion 1 → 2 migration (the UNLOCKED model).
 *
 * v1 templates were beat-locked: media/text/image carried absolute beat
 * INDEX pairs, music carried `bpm` + a beat grid, imported songs carried a
 * detected phase/beatCount. v2 is plain seconds: slots carry `dur`,
 * overlays carry `time`, music is a soundtrack (tone | local | none).
 *
 * Pure and deterministic — same input, same output, no clock, no DOM.
 * Runs automatically inside `validateTemplate`, so every consumer (registry,
 * library bootstrap, share import) accepts old files transparently.
 *
 * Old built-in SONG ids (`song.*`) no longer exist — they map to the
 * nearest vibe-matching tone so an old template keeps playing; the
 * creator can change it in the dropdown like any other pick.
 */

import type { Template } from "./types";

/** v1 built-in song → v2 tone (documented, not guessed at random). */
const SONG_TO_TONE: Record<string, string> = {
  "song.sunset": "tone:samsung.morning_flower",
  "song.drive": "tone:nokia.tune_remix",
  "song.pulse": "tone:china.mtk_default",
};

const r6 = (n: number): number => Number(n.toFixed(6));

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Upgrade a template of any schema to the current one (v2).
 * v2 input passes through untouched; unknown versions pass through so
 * validation can report them honestly.
 */
export function migrateTemplate(raw: unknown): unknown {
  if (!isObj(raw) || raw.schemaVersion !== 1) return raw;

  const t = raw as unknown as Partial<Template> & {
    music: { track?: unknown; bpm?: unknown; volume?: unknown; local?: unknown };
    tracks: {
      media?: unknown;
      overlay?: unknown;
      images?: unknown;
    };
  };

  const bpm =
    typeof t.music?.bpm === "number" && t.music.bpm > 0 ? t.music.bpm : 120;
  const bd = 60 / bpm;

  /* media: beat index pairs → own length in seconds (the chain stays
   * contiguous because resolve now chains cumulative durations) */
  const media = Array.isArray(t.tracks?.media) ? t.tracks.media : [];
  const newMedia = media.map((s) => {
    if (!isObj(s)) return s;
    const slot = s as { beats?: unknown };
    if (!Array.isArray(slot.beats) || slot.beats.length !== 2) return s;
    const [a, b] = slot.beats as [unknown, unknown];
    const { beats: _drop, ...rest } = slot;
    if (typeof a !== "number" || typeof b !== "number") return s;
    return { ...rest, dur: r6(Math.max(0, (b - a) * bd)) };
  });

  /* the video's total (chain end) — overlay windows clamp to it exactly as
   * the v1 resolver did, so resolved behaviour is preserved */
  const total = newMedia.reduce(
    (m, s) =>
      isObj(s) && typeof (s as { dur?: unknown }).dur === "number"
        ? m + (s as { dur: number }).dur
        : m,
    0,
  );

  const toTime = (s: unknown): unknown => {
    if (!isObj(s)) return s;
    const slot = s as { beats?: unknown };
    if (!Array.isArray(slot.beats) || slot.beats.length !== 2) return s;
    const [a, b] = slot.beats as [unknown, unknown];
    const { beats: _drop, ...rest } = slot;
    if (typeof a !== "number" || typeof b !== "number") return s;
    const start = r6(Math.max(0, a * bd));
    const end = r6(Math.min(b * bd, total));
    return { ...rest, time: [start, Math.max(start, end)] as [number, number] };
  };

  const overlay = Array.isArray(t.tracks?.overlay)
    ? t.tracks.overlay.map(toTime)
    : [];
  const images = Array.isArray(t.tracks?.images)
    ? t.tracks.images.map(toTime)
    : [];

  /* music: soundtrack only — drop bpm/grid/phase; map retired song ids */
  const oldTrack = typeof t.music?.track === "string" ? t.music.track : "none";
  const track =
    SONG_TO_TONE[oldTrack] ??
    (oldTrack.startsWith("song.") ? "none" : oldTrack);

  const local = isObj(t.music?.local)
    ? (() => {
        const l = t.music.local as { name?: unknown; duration?: unknown };
        if (typeof l.name !== "string" || typeof l.duration !== "number")
          return undefined;
        return { name: l.name, duration: l.duration };
      })()
    : undefined;

  const music: Template["music"] = {
    track,
    ...(typeof t.music?.volume === "number" ? { volume: t.music.volume } : {}),
    ...(local ? { local } : {}),
  };

  return {
    ...t,
    schemaVersion: 2,
    music,
    tracks: {
      media: newMedia,
      overlay,
      ...(Array.isArray(t.tracks?.images) ? { images } : {}),
    },
  };
}
