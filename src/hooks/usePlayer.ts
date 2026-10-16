/**
 * usePlayer — the master clock. rAF drives both the canvas (shared
 * FrameRenderer) and the Web Audio engine; videos play in real time.
 * Preview and export use the same render/sync/audio primitives.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { Schedule } from "@/core/model/types";
import { audio } from "@/player/audio";
import {
  FrameRenderer,
  buildMediaPlan,
  syncMedia,
  type Bindings,
} from "@/player/frame";

/* preview backing store — one notch lower on weak phones (few cores or
   little memory): 540×960 instead of 720×1280 = 44% fewer pixels per
   frame for the same pipeline. The EXPORT renders at its own full size —
   preview quality may step down, preview ≡ export content never does. */
const PREVIEW_SIZE: { w: number; h: number } = (() => {
  if (typeof navigator === "undefined") return { w: 720, h: 1280 };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak =
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency ?? 8) <= 4;
  return weak ? { w: 540, h: 960 } : { w: 720, h: 1280 };
})();

export interface PlayerHandle {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  seek: (t: number) => void;
  /** live playhead in seconds — the timeline strip reads it every frame */
  getTime: () => number;
}

interface UsePlayerOptions {
  schedule: Schedule;
  bindings: Bindings;
  soundOn: Record<string, boolean>;
  /** re-render whenever any of the inputs change while paused */
  dirtyKey?: string;
}

export function usePlayer(opts: UsePlayerOptions): {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  time: number;
  playing: boolean;
  handle: PlayerHandle;
} {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FrameRenderer | null>(null);
  const tRef = useRef(0);
  const playingRef = useRef(false);
  const dirtyRef = useRef(true);
  const musicSigRef = useRef<{
    track: string;
    volume: number;
    offset: number;
  } | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  /* ---------------- clock + render loop ---------------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { schedule, bindings, soundOn } = optsRef.current;

      if (playingRef.current) {
        const prev = tRef.current;
        const next = Math.min(prev + dt, schedule.duration);
        tRef.current = next;
        audio.tick(prev, next);
        syncMedia(schedule, bindings, next, true, false);

        // duck music while a clip's original sound is audible
        const plan = buildMediaPlan(schedule);
        const anyClipSound = plan.some(
          (p) =>
            soundOn[p.slotId] &&
            next >= p.start &&
            next < p.end &&
            bindings[p.slotId]?.type === "video",
        );
        audio.setDuck(anyClipSound);

        setTime(next);
        dirtyRef.current = true;
        if (next >= schedule.duration) {
          playingRef.current = false;
          setPlaying(false);
          audio.stop();
          syncMedia(schedule, bindings, next, false, false);
        }
      }

      if (dirtyRef.current) {
        const canvas = canvasRef.current;
        if (canvas) {
          if (!rendererRef.current) rendererRef.current = new FrameRenderer();
          const ctx = canvas.getContext("2d");
          if (ctx) {
            if (
              canvas.width !== PREVIEW_SIZE.w ||
              canvas.height !== PREVIEW_SIZE.h
            ) {
              canvas.width = PREVIEW_SIZE.w;
              canvas.height = PREVIEW_SIZE.h;
            }
            rendererRef.current.render(
              ctx,
              canvas.width,
              canvas.height,
              schedule,
              bindings,
              tRef.current,
            );
          }
        }
        dirtyRef.current = false;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------------- react to input changes ---------------- */
  useEffect(() => {
    dirtyRef.current = true;
    const m = opts.schedule.entries.find((e) => e.kind === "music");
    const sig = m
      ? {
          track: String(m.params.track),
          volume: Number(m.params.volume ?? 0.9),
          offset: Number(m.params.offset ?? 0),
        }
      : null;
    if (playingRef.current) {
      const prev = musicSigRef.current;
      const presenceChanged = (prev === null) !== (sig === null);
      const trackChanged =
        prev !== null &&
        sig !== null &&
        (prev.track !== sig.track || prev.offset !== sig.offset);
      if (presenceChanged || trackChanged) {
        // music turned on/off or a different track — re-anchor the source now
        audio.start(opts.schedule, tRef.current);
      } else if (prev !== null && sig !== null && prev.volume !== sig.volume) {
        // same track, new level — move the gain in place (no restart blip)
        audio.setMusicVolume(sig.volume);
      } else {
        audio.resetFired();
      }
    }
    musicSigRef.current = sig;
  }, [opts.schedule]);

  useEffect(() => {
    dirtyRef.current = true;
    syncMedia(opts.schedule, opts.bindings, tRef.current, playingRef.current, true);
  }, [opts.bindings, opts.schedule]);

  useEffect(() => {
    dirtyRef.current = true;
  }, [opts.dirtyKey]);

  /* clip sound routing follows the soundOn switches */
  useEffect(() => {
    for (const [slotId, on] of Object.entries(opts.soundOn)) {
      const b = opts.bindings[slotId];
      if (b?.type === "video") {
        const v = b.el as HTMLVideoElement;
        if (on && playingRef.current) {
          // media elements are an external system (DOM), mutated deliberately
          // eslint-disable-next-line react-hooks/immutability
          v.muted = false;
          audio.attachClip(v);
        } else {
          v.muted = true;
        }
      }
    }
  }, [opts.soundOn, opts.bindings]);

  /* pause everything on unmount */
  useEffect(
    () => () => {
      playingRef.current = false;
      audio.stop();
    },
    [],
  );

  /* ---------------- controls ---------------- */
  const play = useCallback(() => {
    const { schedule, bindings, soundOn } = optsRef.current;
    audio.ensure();
    audio.prepare(schedule);
    audio.start(schedule, tRef.current >= schedule.duration ? 0 : tRef.current);
    if (tRef.current >= schedule.duration) tRef.current = 0;
    syncMedia(schedule, bindings, tRef.current, true, true);
    for (const [slotId, on] of Object.entries(soundOn)) {
      const b = bindings[slotId];
      if (b?.type === "video") {
        const v = b.el as HTMLVideoElement;
        if (on) {
          v.muted = false;
          audio.attachClip(v);
        } else {
          v.muted = true;
        }
      }
    }
    playingRef.current = true;
    setPlaying(true);
  }, []);

  const pause = useCallback(() => {
    const { schedule, bindings } = optsRef.current;
    playingRef.current = false;
    setPlaying(false);
    audio.stop();
    syncMedia(schedule, bindings, tRef.current, false, false);
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [play, pause]);

  const restart = useCallback(() => {
    const { schedule, bindings } = optsRef.current;
    tRef.current = 0;
    setTime(0);
    dirtyRef.current = true;
    syncMedia(schedule, bindings, 0, false, true);
    if (playingRef.current) {
      audio.start(schedule, 0);
    }
  }, []);

  const seek = useCallback((t: number) => {
    const { schedule, bindings } = optsRef.current;
    const clamped = Math.max(0, Math.min(t, schedule.duration));
    tRef.current = clamped;
    setTime(clamped);
    dirtyRef.current = true;
    syncMedia(schedule, bindings, clamped, playingRef.current, true);
    if (playingRef.current) audio.start(schedule, clamped);
  }, []);

  const getTime = useCallback(() => tRef.current, []);

  return {
    canvasRef,
    time,
    playing,
    handle: { play, pause, toggle, restart, seek, getTime },
  };
}
