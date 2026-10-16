/**
 * AudioEngine — one Web Audio graph for BOTH preview and export, which is
 * what makes preview ≡ export real: the exporter records this exact graph.
 *
 *   music gain ─┐
 *   sfx gain ───┼─ master ──→ speakers
 *   clip gain ──┘            └──→ MediaStreamDestination (recorder)
 */

import type { Schedule, ScheduleEntry } from "@/core/model/types";
import { isToneTrack, toneTrackId } from "@/core/model/types";
import { getTone } from "@/core/audio/tones";
import { synthTone, synthSfx } from "./synth";

const MUSIC_BASE = 0.9;
const DUCK = 0.35;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private clipGain: GainNode | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;

  private sfxCache = new Map<string, AudioBuffer>();
  private trackCache = new Map<string, AudioBuffer>();
  private mediaSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

  private musicSrc: AudioBufferSourceNode | null = null;
  private musicSrcGain: GainNode | null = null;
  private auditionSrc: AudioBufferSourceNode | null = null;
  private schedule: Schedule | null = null;
  private fired = new Set<number>();
  private ducked = false;
  private running = false;

  /** Create/resume the context — call from a user gesture. */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.clipGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_BASE;
      this.sfxGain.gain.value = 0.9;
      this.clipGain.gain.value = 1;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.clipGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.streamDest);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Audio graph node the exporter records from. */
  stream(): MediaStreamAudioDestinationNode {
    this.ensure();
    return this.streamDest as MediaStreamAudioDestinationNode;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Register a decoded local-music buffer under its `local:<fileId>` track
   * key (D40). Once registered, prepare()/start() treat it exactly like a
   * synthesized tone pass — preview and export share the same code path.
   */
  registerTrack(key: string, buffer: AudioBuffer): void {
    this.trackCache.set(key, buffer);
  }

  hasTrack(key: string): boolean {
    return this.trackCache.has(key);
  }

  /** A registered track's buffer — lets the offline export renderer reuse it. */
  getTrack(key: string): AudioBuffer | undefined {
    return this.trackCache.get(key);
  }

  /** Drop a local track's buffer (memory stays bounded to one file). */
  dropTrack(key: string): void {
    this.trackCache.delete(key);
  }

  /** Route a clip element's audio through the graph (for original sound). */
  attachClip(el: HTMLMediaElement): void {
    const ctx = this.ensure();
    if (this.mediaSources.has(el)) return;
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(this.clipGain as GainNode);
      this.mediaSources.set(el, src);
    } catch {
      // Already connected elsewhere — element audio simply stays direct.
    }
  }

  /** Pre-render every sound the schedule references (cheap, deterministic). */
  prepare(schedule: Schedule): void {
    const ctx = this.ensure();
    for (const e of schedule.entries) {
      if (e.kind === "audio" && !this.sfxCache.has(e.target)) {
        const buf = synthSfx(ctx, e.target);
        if (buf) this.sfxCache.set(e.target, buf);
      }
      if (e.kind === "music") {
        const key = `${e.params.track}`;
        // tone presets synthesize one pass (cached); local songs were
        // registered by the UI before playback (D40 unchanged).
        if (isToneTrack(key) && !this.trackCache.has(key)) {
          const tone = getTone(toneTrackId(key));
          if (tone) this.trackCache.set(key, synthTone(ctx, tone));
        }
      }
    }
  }

  /**
   * One-shot preview of a single catalog sound (D41 — the builder
   * auditions whatever the creator picks). Repeated picks cut the
   * previous audition instead of stacking.
   */
  audition(asset: string, volume = 0.9): void {
    const ctx = this.ensure();
    if (!this.sfxCache.has(asset)) {
      const buf = synthSfx(ctx, asset);
      if (!buf) return;
      this.sfxCache.set(asset, buf);
    }
    this.playOneShot(this.sfxCache.get(asset) as AudioBuffer, this.sfxGain, volume);
  }

  /** One-shot preview of a music tone (the dropdown auditions each pick). */
  auditionTone(track: string, volume = MUSIC_BASE): void {
    const ctx = this.ensure();
    if (!this.trackCache.has(track)) {
      const tone = getTone(toneTrackId(track));
      if (!tone) return;
      this.trackCache.set(track, synthTone(ctx, tone));
    }
    this.playOneShot(this.trackCache.get(track) as AudioBuffer, this.musicGain, volume);
  }

  /** Cut any running audition, then play `buf` once through `dest`. */
  private playOneShot(buf: AudioBuffer, dest: GainNode | null, volume: number): void {
    if (this.auditionSrc) {
      try {
        this.auditionSrc.stop();
      } catch {
        /* already stopped */
      }
      this.auditionSrc.disconnect();
      this.auditionSrc = null;
    }
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(dest);
    src.start();
    this.auditionSrc = src;
  }

  /** Start playback anchored at fromT seconds. */
  start(schedule: Schedule, fromT: number): void {
    const ctx = this.ensure();
    this.prepare(schedule);
    this.stopMusic();
    this.schedule = schedule;
    this.fired.clear();
    this.running = true;

    const musicEntry = schedule.entries.find((e) => e.kind === "music");
    if (musicEntry) {
      const track = String(musicEntry.params.track);
      const buf = this.trackCache.get(track);
      if (buf) {
        const tone = isToneTrack(track) ? getTone(toneTrackId(track)) : undefined;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const g = ctx.createGain();
        g.gain.value = Number(musicEntry.params.volume ?? MUSIC_BASE);
        src.connect(g);
        g.connect(this.musicGain as GainNode);
        const when = ctx.currentTime + 0.03;
        if (tone) {
          // Loop by NATURE (settled): ringtones/melodies loop to fill the
          // video; alerts/beeps play once. A once-playing tone that already
          // sounded in video-time stays silent after a seek — honest, no
          // fake replay.
          if (tone.loop || fromT < buf.duration - 0.05) {
            src.loop = tone.loop;
            const offset = tone.loop
              ? fromT % Math.max(0.1, buf.duration)
              : Math.min(fromT, Math.max(0, buf.duration - 0.05));
            src.start(when, offset);
            this.musicSrc = src;
            this.musicSrcGain = g;
          }
        } else {
          // an imported song: play the video-length window that starts at
          // the chosen segment offset (D50); when the song runs out before
          // the video does it loops inside that same window
          const winStart = Math.min(
            Math.max(0, Number(musicEntry.params.offset ?? 0)),
            Math.max(0, buf.duration - 0.05),
          );
          const winLen = Math.max(
            0.05,
            Math.min(schedule.duration, buf.duration - winStart),
          );
          const loop = winLen < schedule.duration - 0.05;
          src.loop = loop;
          src.loopStart = winStart;
          src.loopEnd = winStart + winLen;
          const pos = loop ? fromT % winLen : Math.min(fromT, winLen - 0.05);
          src.start(when, winStart + Math.max(0, pos));
          this.musicSrc = src;
          this.musicSrcGain = g;
        }
      }
    }
  }

  /**
   * Called every frame: fire any audio entries crossed in (lastT, nowT].
   * Deterministic — same schedule + same times ⇒ same triggers in preview
   * and export.
   */
  tick(lastT: number, nowT: number): void {
    if (!this.running || !this.schedule || nowT < lastT) return;
    const ctx = this.ctx;
    if (!ctx) return;
    this.schedule.entries.forEach((e, i) => {
      if (e.kind !== "audio") return;
      if (e.t > lastT && e.t <= nowT && !this.fired.has(i)) {
        this.fired.add(i);
        this.triggerSfx(ctx, e, nowT);
      }
    });
  }

  private triggerSfx(ctx: AudioContext, e: ScheduleEntry, nowT: number): void {
    const buf = this.sfxCache.get(e.target);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Number(e.params.volume ?? 1);
    src.connect(g);
    g.connect(this.sfxGain as GainNode);
    const at = Math.max(ctx.currentTime, ctx.currentTime + (e.t - nowT) + 0.02);
    src.start(at);
  }

  /** Duck music while a clip's original sound is playing. */
  setDuck(on: boolean): void {
    if (!this.musicGain || !this.ctx || on === this.ducked) return;
    this.ducked = on;
    this.musicGain.gain.setTargetAtTime(
      on ? MUSIC_BASE * DUCK : MUSIC_BASE,
      this.ctx.currentTime,
      0.06,
    );
  }

  /** Reset the fired set (schedule changed or user seeked). */
  resetFired(): void {
    this.fired.clear();
  }

  private stopMusic(): void {
    if (this.musicSrc) {
      try {
        this.musicSrc.stop();
      } catch {
        /* already stopped */
      }
      this.musicSrc.disconnect();
      this.musicSrc = null;
    }
    if (this.musicSrcGain) {
      this.musicSrcGain.disconnect();
      this.musicSrcGain = null;
    }
  }

  /** Live-update the playing music's level (the per-source gain). A short
   *  ramp avoids the click a hard jump would make, so a volume slider feels
   *  immediate without restarting the source. */
  setMusicVolume(volume: number): void {
    const g = this.musicSrcGain;
    if (!g || !this.ctx) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(volume, now, 0.02);
  }

  stop(): void {
    this.running = false;
    this.stopMusic();
    this.schedule = null;
    this.fired.clear();
    this.setDuck(false);
  }

  suspendForExport(): void {
    /* exported audio is driven by tick() — nothing to suspend */
  }
}

/** One engine for the whole app (preview and exporter share it). */
export const audio = new AudioEngine();
